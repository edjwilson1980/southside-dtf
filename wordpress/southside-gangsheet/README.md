# South Side Gang Sheet — WordPress plugin

Embed the customer builder and **Add to Cart** into WooCommerce on southsidedtf.com.

## Download

Use the ready zip in this repo:

- [`wordpress/southside-gangsheet-1.03.zip`](./southside-gangsheet-1.03.zip)

Or zip the `southside-gangsheet/` folder yourself.

## Install on WordPress

1. **Plugins → Add New → Upload Plugin** → choose `southside-gangsheet-1.03.zip` → Activate
2. **Settings → Gang Sheet Builder**
   - Builder URL: `https://southside-dtf.vercel.app`
   - WooCommerce product ID: **4365** (Custom Gang Sheet Builder), or leave `0` to auto-find slug `custom-gang-sheet-builder`
3. Edit the product/page and add:

```
[southside_gangsheet]
```

4. On Vercel, keep `NEXT_PUBLIC_STORE_ORIGIN=https://southsidedtf.com` set (already on production).

## How Add to Cart works

1. Customer uses the builder inside the iframe (`/embed`)
2. Clicks **Add to Cart**
3. Builder `postMessage`s the PNG + sheet size to this plugin
4. Plugin uploads the file, picks the sheet-length variation, adds the Woo cart line, redirects to cart
