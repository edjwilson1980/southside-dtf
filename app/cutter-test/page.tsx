import { redirect } from 'next/navigation'

/** Cutter tests live under the shop tools app. */
export default function CutterTestRedirect() {
  redirect('/shop/cutter-test')
}
