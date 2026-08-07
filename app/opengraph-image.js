import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "GoTalkify — Learn English & French with Native Tutors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0C1B2E 0%, #16304F 55%, #2A4A73 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 110,
              height: 110,
              borderRadius: 28,
              background: "white",
              color: "#16304F",
              fontSize: 72,
              fontWeight: 800,
            }}
          >
            G
          </div>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800 }}>
            GoTalkify
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: 36,
            color: "#dbeafe",
          }}
        >
          Learn English &amp; French with native tutors, 1-on-1
        </div>
      </div>
    ),
    { ...size }
  );
}
