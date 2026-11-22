import { defineEveryApp } from "@every-app/sdk";

// defineEveryApp types the manifest. The Gateway keeps it; the Worker gets
// the bindings it lists (env.DB, env.files), never the file.
export default defineEveryApp({
  id: "cookie-cutter-maker",
  name: "Cookie Cutter Maker",
  description:
    "Turn a picture or simple shape into a 3D-printable cookie cutter or imprint cutter, and keep your designs and settings.",
  icon: "/icon.svg",
  resources: {
    d1: ["DB"],
    // The artwork each saved design was made from.
    r2: ["files"],
  },
});
