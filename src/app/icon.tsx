import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0b1625 0%, #061019 45%, #02060b 100%)",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 370,
            height: 370,
            borderRadius: 92,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #22d3ee 0%, #0ea5e9 45%, #6366f1 100%)",
            boxShadow: "0 0 50px rgba(34, 211, 238, 0.5)",
            color: "#031018",
            fontSize: 220,
            fontWeight: 800,
            fontFamily: "Arial, sans-serif",
          }}
        >
          P
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 42,
            color: "#67e8f9",
            fontSize: 27,
            letterSpacing: 6,
            fontFamily: "Arial, sans-serif",
          }}
        >
          PROSMART
        </div>
      </div>
    ),
    size
  );
}
