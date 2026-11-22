# Cookie Cutter Maker

Turn a picture or a simple shape into a 3D-printable cookie cutter or imprint cutter, preview it in 3D and download it as an STL. Designs and settings profiles are saved per member.

Inspired by https://app.cookiecad.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Start from an uploaded, dropped or pasted PNG, JPG, WebP or SVG, a basic shape or a sample, traced in the browser.
- Make a cutter or an imprint cutter with size, blade, thickening, sharp tip, handle and imprint settings in mm or inches.
- Turn and zoom the model in a 3D preview and download it as an STL in millimetres.
- Keep a private library with search, favourites, tags, sorting, bulk actions and a trash.
- Save settings as named profiles, with or without the size, and apply them to any design.

Left out: accounts and sign-in, which your Gateway handles; paid plans; other tool types such as stamps, molds and rollers; advanced blade and imprint options; preview staging; translations and side tools.

## Setup

```sh
pnpm install
pnpm dev            # run locally behind the local Gateway
pnpm test           # unit tests
pnpm run deploy     # deploy to your EveryApp Gateway
```

The release checks in `checks/` run against a packaged build with `node checks/behavior.mjs` (and `authorization.mjs`, `persistence.mjs`) inside the oss.new runtime.

There are no secrets or settings. The app uses a D1 database and an R2 bucket (`files`) for the uploaded artwork; R2 must be enabled once on the Cloudflare account.

## Limitations

- One outline per design: when an image has several separate shapes, only the largest becomes the cutter.
- Tracing works best on a dark shape on a light or transparent background; photos with soft edges trace poorly.
- The 3D preview needs WebGL; without it the model can still be downloaded.
- STL files are made of stacked solid layers, which slicers merge on import.
- Deploying to a real Gateway was not part of local testing.
