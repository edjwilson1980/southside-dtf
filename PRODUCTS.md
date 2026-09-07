# South Side DTF — two products in one repo

These are **separate products** that share print/packing libraries. Do not mix their UX.

## Customer builder (`/`)

- Public gang sheet builder for customers
- Upload, size charts, pricing estimate, preview, print PNG download
- **Never** links to shop tools, cutter tests, or PLT downloads
- When **Pre-cut DTFs** is on and they confirm build: creates a customer folder in Google Drive and uploads the print PNG (browser resumable) + cutter PLT (server-side upload) there (PLT is not downloaded in the browser)
- Drive uses shop Gmail OAuth (personal Gmail has no Shared drives). Staff connect once at `/shop/connect-drive`

## Shop tools (`/shop`)

- Internal production app for staff
- Full builder plus PLT cut files, registration-mark guidance, and cutter tests
- May link to the customer builder
- Advanced features belong here, not on `/`

### Shop routes

- `/shop` — production gang sheet builder
- `/shop/cutter-test` — cutter advance / registration tests
- `/cutter-test` — redirects to `/shop/cutter-test`

Shared code lives under `lib/` (compose, cut layout, sheet size, image tools).
