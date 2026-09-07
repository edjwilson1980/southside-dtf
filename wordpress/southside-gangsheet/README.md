# South Side Gang Sheet — WordPress plugin

Embed the customer builder and **Add to Cart** into WooCommerce on southsidedtf.com.

## Download

Use the ready zip in this repo:

- [`wordpress/southside-gangsheet-1.05.zip`](./southside-gangsheet-1.05.zip)

Or zip the `southside-gangsheet/` folder yourself.

## Install on WordPress

1. **Plugins → Add New → Upload Plugin** → choose `southside-gangsheet-1.05.zip` → Activate
2. **Settings → Gang Sheet Builder**
   - Builder URL: `https://southside-dtf.vercel.app`
   - WooCommerce product ID: **4365** (Custom Gang Sheet Builder), or leave `0` to auto-find slug `custom-gang-sheet-builder`
   - Pre-cut product ID: the hidden Pre-cut Transfers product (leave `0` until that product exists)
   - Upload product ID: optional product for customer-uploaded sheets (leave `0` to reuse the main product)
3. Edit the product/page and add:

```
[southside_gangsheet]
```

Upload-your-own flow:

```
[southside_gangsheet mode="upload"]
```

4. On Vercel, keep `NEXT_PUBLIC_STORE_ORIGIN=https://southsidedtf.com` set (already on production).

## How Add to Cart works

1. Customer uses the builder (`/embed`) or upload flow (`/embed/upload`) inside the iframe
2. Clicks **Add to Cart**
3. App uploads to Google Drive, then `postMessage`s the file + sheet meta to this plugin
4. Plugin stores a local copy, picks the sheet-length variation from **billable** height, adds the Woo cart line, and when configured adds a separate pre-cut product line
5. Redirects to cart
