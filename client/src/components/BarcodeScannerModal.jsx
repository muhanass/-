import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserMultiFormatReader } from '@zxing/browser';
import Modal from './Modal';

export default function BarcodeScannerModal({ onDetected, onClose }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        (result) => {
          if (result && !cancelled) {
            cancelled = true;
            controlsRef.current?.stop();
            onDetected(result.getText());
          }
        }
      )
      .then((controls) => {
        controlsRef.current = controls;
      })
      .catch(() => setError(t('common.cameraError')));

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title={t('common.scanWithCamera')} onClose={onClose}>
      {error ? (
        <div className="alert alert-danger">{error}</div>
      ) : (
        <div className="scanner-frame">
          <video ref={videoRef} muted playsInline />
          <p className="text-muted" style={{ textAlign: 'center', marginTop: 10 }}>
            {t('common.pointCameraAtBarcode')}
          </p>
        </div>
      )}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  );
}
