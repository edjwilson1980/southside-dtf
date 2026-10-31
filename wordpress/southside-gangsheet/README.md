# South Side Gang Sheet — WordPress plugin

Embed the customer builder and **Add to Cart** into WooCommerce on southsidedtf.com.

## Download

Use the ready zip in this repo:

- [`wordpress/southside-gangsheet-1.31.zip`](./southside-gangsheet-1.31.zip)

Or zip the `southside-gangsheet/` folder yourself.

## Install on WordPress

1. **Plugins → Add New → Upload Plugin** → choose `southside-gangsheet-1.31.zip` → Activate
2. **Settings → Gang Sheet Builder**
   - Builder URL: `https://southside-dtf.vercel.app`
   - WooCommerce product ID: **4365** (or leave `0` for slug `custom-gang-sheet-builder`)
   - Pre-cut product ID: must be the **pre-cut** product — never the “I Don’t Know How to Build a Gangsheet” service product
   - Upload product ID: customer-uploaded sheets (leave `0` to reuse main product)
   - UV DTF product ID: the UV DTF gang sheet product (22 in wide, variations by length such as `22in x 12in`). Leave `0` to auto-detect slug `uv-dtf-stickers` / `uv-dtf`, or the first product with attribute `pa_print_type = uv-dtf`. The settings page shows which product is in use.
   - Drive finalize URL: `https://southside-dtf.vercel.app/api/drive/finalize`
   - Drive commit secret: must match `SSGS_COMMIT_SECRET` on Vercel (used only to rename Drive files with the order number after payment)
3. Shortcodes:

```
[southside_gangsheet]
[southside_gangsheet mode="upload"]
[southside_gangsheet mode="uv-dtf"]
[southside_artwork_intake]
```

4. Keep `NEXT_PUBLIC_STORE_ORIGIN=https://southsidedtf.com` on Vercel.

## Print & Press (v1.25+, prices updated in 1.27)

- The customer builder can add **Print & Press** (customer supplies the garments, we press the transfers). The payload carries `printPress` with the garment lines (garment, color, location `front` / `chest` (left chest logo) / `back` / `both` / `chest-back`, S–3XL counts, names roster, which design goes on each side), the counts, the tier and the Drive link to the **press sheet PDF** that was uploaded with the sheet PNGs/PLTs.
- The plugin **recomputes labor server-side** from the counts — it never trusts the browser total. Ladder per garment: 1–10 **$10.00**, 11–20 **$5.00**, 21–50 **$3.00**, 51–99 **$2.00**, 100+ **$1.50**; second side **+$2.00 / +$1.50 / +$1.25 / +$1.00 / +$0.75**; **+$0.50** per personalized garment. The browser and the plugin must agree — when the ladder changes, both the builder and the plugin ship together.
- Labor is added as **one cart fee** per job: `Print & Press labor (N garments)` (hook `woocommerce_cart_calculate_fees`, charged once on sheet 1, not × quantity). No new product or setting is needed.
- Every Print & Press transfer is pre-cut, and the pre-cut charge is waived: the sheet lines carry `ssgs_precut = yes` (so the cut files are expected) with `ssgs_precut_total = 0`, and **no pre-cut companion line** is added. Cart rows show `Pre-cut fee: Included with Print & Press`.
- Cart and order line meta: `ssgs_pp` (summary), `ssgs_pp_labor`, `ssgs_pp_garments`, `ssgs_pp_double`, `ssgs_pp_names`, `ssgs_pp_tier`, `ssgs_pp_line_N` (one readable row per garment line), `ssgs_press_sheet_url` / `ssgs_press_sheet_name` (**Press sheet** link), plus hidden `_ssp_print_press` and `_ssgs_pp_lines` (JSON) for production. An order note repeats the breakdown with the press sheet link.
- Print the press sheet PDF from the Drive folder for the press crew; it lists the PNG/PLT names, size totals, which design goes on which side of each garment line, the name roster and tick boxes.

## Jobs longer than 200 in (v1.24+)

- The builder packs anything longer than one 200 in sheet onto **separate sheets** labelled `1 of 3`, `2 of 3`, `3 of 3` — each with its own print PNG (and its own `… cut.plt` when pre-cut is on) in the Drive job folder.
- The payload carries `sheets[]`; the plugin adds **one cart line per sheet**, each matched to its own length variation, so 500 in bills as **200 + 200 + 100** ($115 + $115 + $60), not as one 200 in sheet. Every sheet gets its own pre-cut companion line. Lines show `Sheet: 2 of 3`, the print file, and the cut file link.
- All sheets go to WooCommerce in **one** request (the store page redirects to the cart as soon as the first line is accepted, which used to lose the rest).
- Single-length payloads that are longer than the largest variation (done-for-you intake, older builders) are split server-side into `n of N` lines on the ladder; the build fee and pre-cut total are charged once, on sheet 1.
- The plugin no longer silently falls back to the largest variation when nothing fits — it reports the length instead.

## UV DTF gang sheets (v1.31+)

- `[southside_gangsheet mode="uv-dtf"]` embeds `/embed/uv-dtf`: the UV DTF gang sheet builder, the same flow as the DTF builder, with 22 in media and the UV DTF price ladder. `mode="stickers"` / `mode="uv"` still work and load the same builder. The old sticker maker URLs redirect there.
- The payload carries `printType: "uv-dtf"`, `cutEnabled`, `sheets[]` and the Drive links. The plugin routes every sheet to the **UV DTF product**, and each sheet picks the smallest length variation that fits. UV DTF variations needed: **12, 24, 36, 48, 60, 72, 120 and 240 in**. Anything longer than 240 in is split into more sheets.
- **Pre-cut** works like DTF: each sheet gets the same per-transfer pre-cut companion line ($0.50 / $0.25 / $0.20 / $0.15 / $0.10). The cart row shows **Cut: Square Cut 2.5 mm** or **Cut: No**, and `ssgs_cut` / `ssgs_cut_mm` plus hidden `_ssp_cut_enabled` / `_ssp_print_type` are stored for production (spec A7).
- No Print & Press and no intake build fee on UV DTF.
- Standard DTF payloads (no `printType`, or `printType: "dtf"`) behave exactly as before.
- History: 1.23–1.28 embedded the UV DTF Sticker Maker for `mode="stickers"`, and UV DTF lines never got a pre-cut line. 1.22 could not activate (PHP parse error in the checkout hook), and 1.23 fixed that.

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
