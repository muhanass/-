import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recognizeText } from '../lib/ocr';

// Lets the user capture/upload a reference photo of an item and optionally
// run on-device OCR to help pre-fill the name fields (never auto-submits —
// the user always reviews/edits the extracted text before saving).
export default function PhotoCapture({ photoUrl, onPhotoChange, onOcrText }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState('');

  const displaySrc = preview || photoUrl;

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
      setOcrText('');
      setOcrError('');
      onPhotoChange(reader.result, false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleRunOcr() {
    if (!displaySrc) return;
    setOcrLoading(true);
    setOcrError('');
    try {
      const text = await recognizeText(displaySrc);
      setOcrText(text);
      onOcrText?.(text);
    } catch {
      setOcrError(t('common.ocrError'));
    } finally {
      setOcrLoading(false);
    }
  }

  function handleRemove() {
    setPreview(null);
    setOcrText('');
    onPhotoChange(null, true);
  }

  return (
    <div className="field">
      <label>{t('common.photo')}</label>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />

      {displaySrc ? (
        <div className="photo-preview">
          <img src={displaySrc} alt="" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current.click()}>
              {t('common.changePhoto')}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleRunOcr} disabled={ocrLoading}>
              {ocrLoading ? t('common.readingText') : t('common.readTextFromPhoto')}
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={handleRemove}>
              {t('common.removePhoto')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current.click()}>
          {t('common.takeOrUploadPhoto')}
        </button>
      )}

      {ocrError && <div className="alert alert-danger" style={{ marginTop: 10 }}>{ocrError}</div>}

      {ocrText && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>{t('common.extractedText')}</label>
          <textarea rows={3} value={ocrText} readOnly />
          <small className="text-muted">{t('common.ocrHint')}</small>
        </div>
      )}
    </div>
  );
}
