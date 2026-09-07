# South Side Gang Sheet — WordPress plugin

Embed the customer builder and **Add to Cart** into WooCommerce on southsidedtf.com.

## Download

Use the ready zip in this repo:

- [`wordpress/southside-gangsheet-1.10.zip`](./southside-gangsheet-1.10.zip)

Or zip the `southside-gangsheet/` folder yourself.

## Install on WordPress

1. **Plugins → Add New → Upload Plugin** → choose `southside-gangsheet-1.10.zip` → Activate
2. **Settings → Gang Sheet Builder**
   - Builder URL: `https://southside-dtf.vercel.app`
   - WooCommerce product ID: **4365** (or leave `0` for slug `custom-gang-sheet-builder`)
   - Pre-cut product ID: builder path (per-transfer custom price)
   - Upload product ID: customer-uploaded sheets (leave `0` to reuse main product)
   - Drive commit URL: `https://southside-dtf.vercel.app/api/drive/commit`
   - Drive commit secret: must match `SSGS_COMMIT_SECRET` on Vercel
3. Shortcodes:

```
[southside_gangsheet]
[southside_gangsheet mode="upload"]
```

4. Keep `NEXT_PUBLIC_STORE_ORIGIN=https://southsidedtf.com` on Vercel.
5. Set `SSGS_COMMIT_SECRET` on Vercel (all environments) to the same value as the plugin secret.

## How Drive works (v1.10+)

- **Add to Cart** stages the artwork under `wp-content/uploads/gang-sheets/staging/` (multipart upload). Nothing goes to Google Drive yet.
- **After payment** (processing/completed), WordPress calls the Drive commit URL. The Next.js app fetches the staged file and uploads it to Drive.
- Unpaid staging files older than **14 days** are purged daily.

## Pricing notes

- **Builder** sheets: pre-cut is a custom-priced line from `precutTotal` (per transfer).
- **Upload** sheets: sheet price only — no pre-cut line. Uploaded files print as supplied.
