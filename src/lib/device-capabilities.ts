import type { CurtainMotor, DeviceIntegration, TuyaFunction, TuyaSpecification } from "@/types/integration";
import type { DeviceState } from "@/types/smart-home";

export type DataPoints = Record<string, unknown>;
export type TuyaCommand = { code: string; value: unknown };
export class DeviceControlError extends Error {
  constructor(message: string, public code = "UNSUPPORTED_CONTROL", public httpStatus = 422) {
    super(message); this.name = "DeviceControlError";
  }
}
export function valuesOf(status: unknown): DataPoints {
  if (Array.isArray(status)) return Object.fromEntries(status.filter((v) => v && typeof v.code === "string").map((v) => [v.code, v.value]));
  return status && typeof status === "object" ? { ...status as DataPoints } : {};
}
export function specificationValues(fn?: TuyaFunction): { min?: number; max?: number; step?: number; scale?: number; range?: string[] } {
  try { return typeof fn?.values === "string" ? JSON.parse(fn.values) : fn?.values || {}; } catch { return {}; }
}
const kind = (fn?: TuyaFunction) => fn?.type?.toLowerCase();
const isBoolean = (fn: TuyaFunction) => kind(fn) === "boolean" || kind(fn) === "bool";
export const powerFunctions = (functions: TuyaFunction[]) => functions.filter((f) => isBoolean(f) && /^(?:switch(?:_\d+|_led|_usb\d*)?|power)$/.test(f.code));
const choose = (functions: TuyaFunction[], choices: string[]) => choices.map((code) => functions.find((f) => f.code === code)).find(Boolean);
const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
function requireNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new DeviceControlError(`${label} must be a finite number.`, "INVALID_VALUE", 400);
  return value;
}
function rawNumber(fn: TuyaFunction, value: number) {
  const { min, max, step = 1, scale = 0 } = specificationValues(fn);
  const raw = Math.round(value * 10 ** scale / step) * step;
  if ((min !== undefined && raw < min) || (max !== undefined && raw > max)) throw new DeviceControlError(`${fn.code}: requested value is outside this device's supported range.`, "VALUE_OUT_OF_RANGE");
  return raw;
}
function percentageToRaw(fn: TuyaFunction, percentage: number) {
  if (percentage < 0 || percentage > 100) throw new DeviceControlError("Position/brightness must be between 0 and 100.", "VALUE_OUT_OF_RANGE");
  const { min = 0, max = 100, step = 1 } = specificationValues(fn);
  return Math.max(min, Math.min(max, Math.round((min + percentage * (max - min) / 100) / step) * step));
}
function rawToPercentage(fn: TuyaFunction | undefined, value: unknown) {
  const n = num(value); if (n === undefined) return undefined;
  const { min = 0, max = 100 } = specificationValues(fn);
  return max === min ? undefined : Math.max(0, Math.min(100, Math.round((n - min) * 100 / (max - min))));
}
function scaled(fn: TuyaFunction | undefined, value: unknown) {
  const n = num(value); return n === undefined ? undefined : n / 10 ** (specificationValues(fn).scale || 0);
}
export function motorList(functions: TuyaFunction[], status: DataPoints, remoteCategory: string): CurtainMotor[] {
  const controls = functions.filter((f) => /^(control(?:_\d+)?|mach_operate)$/.test(f.code) || (remoteCategory === "cl" && f.code === "switch_1" && kind(f) === "enum"));
  if (!controls.length) {
    const position = choose(functions, ["percent_control", "position"]);
    if (position) controls.push({ code: "__position_only", type: "Enum", values: { range: [] } });
  }
  return controls.map((f, index) => {
    const suffix = f.code.match(/^control(_\d+)$/)?.[1] || "";
    const position = choose(functions, [`percent_control${suffix}`, ...(index === 0 ? ["position"] : [])]);
    const back = status[`control_back_mode${suffix}`] ?? status.control_back_mode;
    // Home Assistant's official cover mapping: CL inverts; CLKG inverts unless back.
    const inverted = f.code === "mach_operate" ? true : remoteCategory === "clkg" ? back !== "back" : remoteCategory === "cl";
    const raw = status[`percent_state${suffix}`] ?? (position ? status[position.code] : undefined);
    const percent = rawToPercentage(position, raw);
    const range = specificationValues(f).range || [];
    const calibration = status[`cur_calibration${suffix}`];
    const calibrated = calibration === undefined ? undefined : !["start", "calibrating", "uncalibrated"].includes(String(calibration));
    return {
      id: f.code === "__position_only" ? position!.code : f.code,
      label: f.name && !/[\u3400-\u9fff]/.test(f.name) ? f.name : controls.length > 1 ? `Motor ${index + 1}` : "Shutter",
      controlCode: f.code === "__position_only" ? undefined : f.code,
      positionCode: position?.code,
      position: percent === undefined ? undefined : inverted ? 100 - percent : percent,
      state: typeof status[f.code] === "string" ? status[f.code] as string : undefined,
      inverted, calibrated,
      canOpen: range.includes("open") || range.includes("FZ"),
      canClose: range.includes("close") || range.includes("ZZ"),
      canStop: range.includes("stop") || range.includes("STOP"),
      canPosition: Boolean(position) && calibrated !== false,
    };
  });
}

/** Only reported values become state. Missing values are never manufactured. */
export function stateFromSpecification(spec: TuyaSpecification, rawStatus: unknown, remoteCategory: string, dashboardCategory: string): DeviceState {
  const functions = spec.functions || [];
  const schemas = [...(spec.status || []), ...functions];
  const v = valuesOf(rawStatus);
  const state: DeviceState = { reportedAt: new Date().toISOString() };
  const switches = powerFunctions(functions);
  if (switches.length) {
    state.channels = switches.map((f, i) => ({ code: f.code, label: /^switch_\d+$/.test(f.code) ? `Gang ${f.code.split("_")[1]}` : switches.length > 1 ? `Channel ${i + 1}` : "Power", isOn: v[f.code] === true }));
    if (switches.some((f) => typeof v[f.code] === "boolean")) state.isOn = switches.some((f) => v[f.code] === true);
  }
  const motors = motorList(functions, v, remoteCategory);
  if (dashboardCategory === "curtain" && motors.length) {
    state.motors = motors;
    state.curtainPosition = motors[0].position;
    const first = motors[0];
    state.curtainState = first.state === "open" || first.state === "FZ" ? "open" : first.state === "close" || first.state === "ZZ" ? "closed" : "paused";
  }
  const field = (keys: string[]) => keys.find((k) => v[k] !== undefined);
  const b = field(["bright_value_v2", "bright_value", "bright"]);
  if (b) state.brightness = rawToPercentage(choose(schemas, [b]), v[b]);
  const mappings: Array<[keyof DeviceState, string[]]> = [
    ["targetTemp", ["temp_set", "target_temperature"]], ["currentTemp", ["temp_current", "va_temperature", "temperature"]],
    ["humidity", ["humidity", "va_humidity"]], ["powerWatts", ["cur_power"]], ["voltage", ["cur_voltage"]],
    ["energyKwh", ["add_ele"]], ["battery", ["battery_percentage", "battery"]], ["pm25", ["pm25_value", "pm25"]], ["co2", ["co2_value", "co2"]],
  ];
  for (const [key, codes] of mappings) {
    const code = field(codes); if (!code) continue;
    const n = scaled(choose(schemas, [code]), v[code]);
    if (n !== undefined) (state as Record<string, unknown>)[key] = n;
  }
  if (typeof v.mode === "string" && ["cool","heat","auto","dry","fan"].includes(v.mode)) state.mode = v.mode as DeviceState["mode"];
  const speed = field(["fan_speed_enum", "fan_speed", "windspeed"]);
  if (speed && ["auto","low","mid","high"].includes(String(v[speed]))) state.fanSpeed = v[speed] as DeviceState["fanSpeed"];
  const motion = field(["pir", "presence_state", "motion_state"]);
  if (motion) state.motionDetected = v[motion] === true || ["pir", "presence", "present", "1"].includes(String(v[motion]));
  state.readOnly = functions.length === 0;
  if (state.readOnly) state.readOnlyReason = /^infrared_|^wnykq$/.test(remoteCategory)
    ? "IR remote: requires the linked IR hub API or a Tuya Tap-to-Run scene."
    : "Tuya exposes no writable functions for this device. Reported status is read-only.";
  return state;
}

export function buildDeviceCommands(functions: TuyaFunction[], status: DataPoints, category: string, updates: Record<string, unknown>): TuyaCommand[] {
  if (updates.motorCode === "all") {
    const motors = motorList(functions, status, category);
    if (!motors.length) throw new DeviceControlError("No writable shutter motors were returned by Tuya.");
    return motors.flatMap((motor) => buildDeviceCommands(functions, status, category, { ...updates, motorCode: motor.id }));
  }
  const commands: TuyaCommand[] = [];
  const add = (fn: TuyaFunction | undefined, value: unknown, feature: string) => {
    if (!fn) throw new DeviceControlError(`Tuya does not expose ${feature} for this device. No command was sent.`);
    if (isBoolean(fn) && typeof value !== "boolean") throw new DeviceControlError(`${feature} requires a boolean value.`, "INVALID_VALUE", 400);
    if (kind(fn) === "enum" && !(specificationValues(fn).range || []).includes(String(value))) throw new DeviceControlError(`${feature}: this mode is not supported by this device.`);
    const previous = commands.find((c) => c.code === fn.code);
    if (previous) previous.value = value; else commands.push({ code: fn.code, value });
  };
  const allowed = new Set(["isOn","channelCode","channelValue","curtainState","curtainPosition","motorCode","brightness","colorTemp","colorRgb","targetTemp","fanSpeed","mode","presetScene","isLocked","extraCode","extraValue"]);
  if (!updates || typeof updates !== "object" || !Object.keys(updates).length) throw new DeviceControlError("No control requested.", "EMPTY_COMMAND", 400);
  for (const key of Object.keys(updates)) if (!allowed.has(key)) throw new DeviceControlError(`Unsupported control: ${key}.`, "INVALID_CONTROL", 400);
  if(updates.extraCode!==undefined){
    if(Object.keys(updates).some(k=>!["extraCode","extraValue"].includes(k)))throw new DeviceControlError("Send an extra AC control separately.","INVALID_CONTROL",400);
    const code=String(updates.extraCode);
    if(!/^(switch_vertical|switch_horizontal|swing|swing_mode|swing_horizontal|swing_vertical|oscillate)$/.test(code))throw new DeviceControlError("Unsupported additional AC control.","INVALID_CONTROL",400);
    const fn=functions.find(f=>f.code===code);
    if(!fn||!['boolean','bool','enum'].includes(kind(fn)||''))throw new DeviceControlError("This AC does not expose that extra control.");
    add(fn,updates.extraValue,code);
  }
  if (updates.channelCode !== undefined) {
    if (typeof updates.channelCode !== "string" || typeof updates.channelValue !== "boolean") throw new DeviceControlError("Choose a valid gang and on/off value.", "INVALID_CHANNEL", 400);
    const fn = powerFunctions(functions).find((f) => f.code === updates.channelCode);
    add(fn, updates.channelValue, `gang ${updates.channelCode}`);
  } else if (updates.isOn !== undefined) {
    if (typeof updates.isOn !== "boolean") throw new DeviceControlError("Power requires true or false.", "INVALID_VALUE", 400);
    const gangs = powerFunctions(functions);
    if (!gangs.length) throw new DeviceControlError("This device has no standard power switch. Use its supported controls or a Tuya scene.");
    gangs.forEach((f) => add(f, updates.isOn, "power"));
  }
  if (updates.curtainState !== undefined || updates.curtainPosition !== undefined) {
    const motors = motorList(functions, status, category);
    const motor = updates.motorCode !== undefined ? motors.find((m) => m.id === updates.motorCode) : motors[0];
    if (!motor) throw new DeviceControlError("Select a supported shutter motor.", "INVALID_MOTOR");
    const instruction = choose(functions, motor.controlCode ? [motor.controlCode] : []);
    if (updates.curtainState !== undefined) {
      const action = String(updates.curtainState);
      const aliases: Record<string, string[]> = { open: ["open","FZ"], closed: ["close","ZZ"], paused: ["stop","STOP"] };
      const value = aliases[action]?.find((s) => (specificationValues(instruction).range || []).includes(s));
      if (!value) throw new DeviceControlError(`This motor does not support ${action}.`, "UNSUPPORTED_MOTOR_ACTION");
      // Explicit open/close/stop, NOT a simultaneous position instruction.
      add(instruction, value, "shutter instruction");
    } else {
      const p = requireNumber(updates.curtainPosition, "Shutter position");
      if (p < 0 || p > 100) throw new DeviceControlError("Shutter position must be 0–100.", "VALUE_OUT_OF_RANGE");
      if (motor.calibrated === false) throw new DeviceControlError("This shutter reports that calibration is unfinished. Finish travel calibration in Tuya before setting a percentage; Open/Close can still be used.", "CALIBRATION_REQUIRED");
      const fn = choose(functions, motor.positionCode ? [motor.positionCode] : []);
      if (!fn) throw new DeviceControlError("This motor has no percentage control; use Open, Stop or Close.");
      add(fn, percentageToRaw(fn, motor.inverted ? 100-p : p), "shutter position");
    }
  }
  if (updates.brightness !== undefined) {
    const fn = choose(functions, ["bright_value_v2","bright_value","bright"]);
    if (!fn) throw new DeviceControlError("This light does not expose a brightness control.");
    add(fn, percentageToRaw(fn, requireNumber(updates.brightness,"Brightness")), "brightness");
  }
  if (updates.targetTemp !== undefined) {
    const fn = choose(functions, ["temp_set","target_temperature","temp_set_f"]);
    if (!fn) throw new DeviceControlError("This AC has no standard temperature data point. IR ACs require IR commands or scenes.");
    const t = requireNumber(updates.targetTemp,"Temperature");
    add(fn, rawNumber(fn, fn.code === "temp_set_f" ? t*9/5+32 : t), "target temperature");
  }
  for (const [key, codes] of [["mode", ["mode","work_mode","mode_type"]], ["fanSpeed", ["fan_speed_enum","fan_speed","windspeed"]]] as const) {
    if (updates[key] === undefined) continue;
    const fn = choose(functions, [...codes]);
    const synonyms: Record<string,string[]> = { cool:["cool","cold"],heat:["heat","hot"],fan:["fan","wind"],dry:["dry","dehumidification"],mid:["mid","middle","medium"],auto:["auto"],low:["low"],high:["high"] };
    const candidates = synonyms[String(updates[key])] || [String(updates[key])];
    const value = candidates.find((v) => (specificationValues(fn).range || []).includes(v));
    if (!fn || value === undefined) throw new DeviceControlError(`${key} is not supported with this value.`);
    add(fn, value, key);
  }
  if (updates.colorTemp !== undefined || updates.colorRgb !== undefined || updates.presetScene !== undefined) throw new DeviceControlError("Use the imported Tuya lighting scenes for colour and presets. No partial power/brightness command was sent.");
  if (updates.isLocked !== undefined) throw new DeviceControlError("Remote lock control requires a dedicated secure lock integration. No command was sent.");
  if (!commands.length) throw new DeviceControlError("No supported command could be created. Nothing was sent.", "EMPTY_COMMAND");
  return commands;
}
export function commandsMatch(commands: TuyaCommand[], status: DataPoints): boolean {
  // Motor instructions are transient, so cloud acceptance is not proof of motion.
  if (commands.some((c) => /^(control|mach_operate|percent_control|position)/.test(c.code))) return false;
  return commands.every((c) => status[c.code] !== undefined && JSON.stringify(status[c.code]) === JSON.stringify(c.value));
}
export const isCloudDevice = (device: { protocol?: string | null; integration?: DeviceIntegration | null }) =>
  device.integration?.source === "smartlife" || device.integration?.source === "developer" || device.integration?.source === "home-assistant" || ["Smart Life","Tuya Cloud"].includes(device.protocol || "");

/** Automatic category groups include devices with a real matching action. */
export function supportsGroupAction(device: { category: string; state: DeviceState; protocol?: string | null; integration?: DeviceIntegration | null }) {
  if (!isCloudDevice(device)) return !device.state.readOnly;
  if (device.integration?.infrared) return device.integration.infrared.available && device.integration.infrared.categoryId === 5;
  if (device.category === "curtain") return Boolean(device.state.motors?.some((motor) => motor.canOpen || motor.canClose));
  return powerFunctions(device.integration?.functions || []).length > 0;
}
