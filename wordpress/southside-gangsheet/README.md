# South Side Gang Sheet — WordPress plugin

Embed the customer builder and **Add to Cart** into WooCommerce on southsidedtf.com.

## Download

Use the ready zip in this repo:

- [`wordpress/southside-gangsheet-1.11.zip`](./southside-gangsheet-1.11.zip)

Or zip the `southside-gangsheet/` folder yourself.

## Install on WordPress

1. **Plugins → Add New → Upload Plugin** → choose `southside-gangsheet-1.11.zip` → Activate
2. **Settings → Gang Sheet Builder**
   - Builder URL: `https://southside-dtf.vercel.app`
   - WooCommerce product ID: **4365** (or leave `0` for slug `custom-gang-sheet-builder`)
   - Pre-cut product ID: builder path (per-transfer custom price)
   - Upload product ID: customer-uploaded sheets (leave `0` to reuse main product)
   - Drive finalize URL: `https://southside-dtf.vercel.app/api/drive/finalize`
   - Drive commit secret: must match `SSGS_COMMIT_SECRET` on Vercel (used only to rename Drive files with the order number after payment)
3. Shortcodes:

```
[southside_gangsheet]
[southside_gangsheet mode="upload"]
```

4. Keep `NEXT_PUBLIC_STORE_ORIGIN=https://southsidedtf.com` on Vercel.

## How Drive works (v1.11+)

- **Add to Cart** uploads the artwork **browser → Google Drive** (chunked resumable PUT). WordPress and Vercel never see the file bytes.
- Cart/order lines store the Drive file id + link only.
- After payment, WordPress may call `/api/drive/finalize` to prepend the order number to the Drive filename.
- Abandoned-cart files are left in Drive on purpose — no cleanup job.
