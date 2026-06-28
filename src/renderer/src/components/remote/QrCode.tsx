import { QRCodeSVG } from 'qrcode.react'

/** A scannable QR rendered on a white tile (so phone cameras read it reliably). */
export function QrCode({ value, size = 208 }: { value: string; size?: number }): React.JSX.Element {
  return (
    <div className="inline-block rounded-xl bg-white p-3 shadow-lg">
      <QRCodeSVG value={value} size={size} level="M" marginSize={0} />
    </div>
  )
}
