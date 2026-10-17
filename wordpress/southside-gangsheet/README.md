# South Side Gang Sheet — WordPress plugin

Embed the customer builder and **Add to Cart** into WooCommerce on southsidedtf.com.

## Download

Use the ready zip in this repo:

- [`wordpress/southside-gangsheet-1.23.zip`](./southside-gangsheet-1.23.zip)

Or zip the `southside-gangsheet/` folder yourself.

## Install on WordPress

1. **Plugins → Add New → Upload Plugin** → choose `southside-gangsheet-1.23.zip` → Activate
2. **Settings → Gang Sheet Builder**
   - Builder URL: `https://southside-dtf.vercel.app`
   - WooCommerce product ID: **4365** (or leave `0` for slug `custom-gang-sheet-builder`)
   - Pre-cut product ID: must be the **pre-cut** product — never the “I Don’t Know How to Build a Gangsheet” service product
   - Upload product ID: customer-uploaded sheets (leave `0` to reuse main product)
   - UV DTF product ID: the UV DTF sticker sheet product (22 in wide, variations by length such as `22in x 12in`). Leave `0` to auto-detect slug `uv-dtf-stickers` / `uv-dtf`, or the first product with attribute `pa_print_type = uv-dtf`. The settings page shows which product is in use.
   - Drive finalize URL: `https://southside-dtf.vercel.app/api/drive/finalize`
   - Drive commit secret: must match `SSGS_COMMIT_SECRET` on Vercel (used only to rename Drive files with the order number after payment)
3. Shortcodes:

```
[southside_gangsheet]
[southside_gangsheet mode="upload"]
[southside_gangsheet mode="stickers"]
[southside_artwork_intake]
```

4. Keep `NEXT_PUBLIC_STORE_ORIGIN=https://southsidedtf.com` on Vercel.

## UV DTF stickers (v1.23+)

- `[southside_gangsheet mode="stickers"]` embeds `/embed/stickers` — the UV DTF Sticker Maker in store mode (no staff bars, no local downloads). **Add to Cart** uploads the sheet PNG (+ cutter PLT when Cut is on) to Google Drive, then sends the line to WooCommerce.
- The payload carries `printType: "uv-dtf"`, `cutEnabled`, and the Drive link. The plugin routes it to the **UV DTF product**, picks the smallest variation whose length fits, and stores:
  - `ssgs_print_type` = `uv-dtf` (cart row **Print type: UV DTF stickers**)
  - `ssgs_cut` = `yes` / `no` (cart row **Cut: Square Cut 2.5 mm** or **Cut: No**), `ssgs_cut_mm` = `2.5`
  - hidden order-line meta `_ssp_cut_enabled` + `_ssp_print_type` for production (spec A7)
- The cut offset is fixed at 2.5 mm on the server, whatever the browser sends. UV DTF lines never get the DTF pre-cut companion line or the intake build fee.
- Standard DTF payloads (no `printType`, or `printType: "dtf"`) behave exactly as before.
- 1.22 could not activate (PHP parse error in the checkout hook). 1.23 fixes that and also saves `ssgs_build_fee` on intake order lines.

## Build fee (v1.22+)

- Self-serve builder and upload carts: **no** layout/build fee.
- Done-for-you intake (`sheetType: intake` / “I Don’t Know How to Build a Gangsheet”): $5 up to 100 in, $10 at 101 in+.

## How Drive works (v1.11+)

- **Add to Cart** uploads the artwork **browser → Google Drive** (chunked resumable PUT). WordPress and Vercel never see the file bytes.
- Cart/order lines store the Drive file id + link only.
- After payment, WordPress may call `/api/drive/finalize` to prepend the order number to the Drive filename.
- Abandoned-cart files are left in Drive on purpose — no cleanup job.

## Upload confirmation (v1.15+)

- Builder shows a green notice under the dropzone when designs are added.
- Embed posts `scroll-to` so the store page scrolls the design list into view (iframe is full-height with no own scrollbar).

## Sheet length matching (v1.16+)

- Variation matching floors the billable length so a 36.49 in print still selects a **36 in** product instead of jumping to a larger size.
