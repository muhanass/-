import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function BarcodeSVG({ value, height = 60 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: 'EAN13',
          height,
          displayValue: true,
          margin: 8,
        });
      } catch {
        // Value isn't a valid EAN-13 (e.g. a manually typed code) — fall back to CODE128.
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          height,
          displayValue: true,
          margin: 8,
        });
      }
    }
  }, [value, height]);

  if (!value) return null;
  return <svg ref={ref} />;
}
