import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import api from '../lib/api';
import { formatQty } from '../lib/format';

export default function Production() {
  const { t } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function loadHistory() {
    api.get('/production').then((r) => setHistory(r.data));
  }

  useEffect(() => {
    api.get('/products').then((r) => setProducts(r.data));
    loadHistory();
  }, []);

  useEffect(() => {
    setPreview(null);
    setError('');
    setSuccess('');
    if (productId && Number(quantity) > 0) {
      const timer = setTimeout(() => {
        api.get(`/production/${productId}/preview`, { params: { quantity } }).then((r) => setPreview(r.data));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [productId, quantity]);

  const selectedProduct = products.find((p) => String(p.id) === String(productId));

  async function handleProduce(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await api.post('/production', { product_id: Number(productId), quantity: Number(quantity), note: note || undefined });
      setSuccess(t('production.successMsg'));
      setQuantity('');
      setNote('');
      setPreview(null);
      loadHistory();
      api.get('/products').then((r) => setProducts(r.data));
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('production.title')}</h1>
          <p className="page-subtitle">{t('production.subtitle')}</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={handleProduce}>
            <div className="field">
              <label>{t('production.selectProduct')}</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isAr ? p.name_ar : p.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('production.quantityToProduce')}</label>
              <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t('common.note')}</label>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {selectedProduct && selectedProduct.recipe.length === 0 && (
              <div className="alert alert-warning">{t('production.noRecipeWarning')}</div>
            )}

            {preview && (
              <div style={{ marginBottom: 16 }}>
                <label>{t('production.preview')}</label>
                <table>
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('production.required')}</th>
                      <th>{t('production.available')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((l) => (
                      <tr key={l.ingredient_id}>
                        <td>{isAr ? l.name_ar : l.name_en}</td>
                        <td>
                          {l.required.toFixed(2)} {l.unit}
                        </td>
                        <td>
                          {l.available.toFixed(2)} {l.unit}
                        </td>
                        <td>
                          <span className={`badge ${l.sufficient ? 'badge-ok' : 'badge-danger'}`}>
                            {l.sufficient ? t('production.sufficient') : t('production.insufficient')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!preview.canProduce && <div className="alert alert-danger" style={{ marginTop: 10 }}>{t('production.cannotProduce')}</div>}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={submitting || !productId || !quantity || (preview && !preview.canProduce)}
            >
              {t('production.produce')}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="mt-0">{t('production.history')}</h3>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('common.quantity')}</th>
                  <th>{t('common.user')}</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      {t('common.noData')}
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id}>
                      <td>{new Date(h.created_at).toLocaleString()}</td>
                      <td>{isAr ? h.product_name_ar : h.product_name_en}</td>
                      <td>
                        {formatQty(h.quantity)} {h.product_unit}
                      </td>
                      <td>{h.user_name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
