import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import api from '../lib/api';
import Modal from '../components/Modal';
import BarcodeSVG from '../components/BarcodeSVG';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import PhotoCapture from '../components/PhotoCapture';
import { useAuth } from '../context/AuthContext';
import { formatQty } from '../lib/format';
import { exportToExcel } from '../lib/excel';
import { generateBarcode } from '../lib/barcodeGen';

function guessNameFromOcr(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const arLine = lines.find((l) => /[؀-ۿ]/.test(l));
  const enLine = lines.find((l) => /[A-Za-z]{2,}/.test(l));
  return { ar: arLine || '', en: enLine || '' };
}

const emptyForm = {
  name_ar: '',
  name_en: '',
  unit: '',
  category_id: '',
  min_qty: 0,
  selling_price: 0,
  barcode: '',
  recipe: [],
};

export default function Products() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAr = i18n.language === 'ar';
  const canManage = user.role === 'admin' || user.role === 'chef';

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const [actionModal, setActionModal] = useState(null); // { type: 'sale'|'waste', item }
  const [actionQty, setActionQty] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [barcodeModal, setBarcodeModal] = useState(null);
  const [quickScanOpen, setQuickScanOpen] = useState(false);
  const [formScannerOpen, setFormScannerOpen] = useState(false);
  const [photoState, setPhotoState] = useState({ dataUrl: null, remove: false });

  async function load() {
    setLoading(true);
    const res = await api.get('/products');
    setItems(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    api.get('/categories', { params: { type: 'product' } }).then((r) => setCategories(r.data));
    api.get('/ingredients').then((r) => setIngredients(r.data));
  }, []);

  function openAdd(prefill) {
    setEditing(null);
    setForm({ ...emptyForm, ...prefill });
    setPhotoState({ dataUrl: null, remove: false });
    setError('');
    setFormOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      name_ar: item.name_ar,
      name_en: item.name_en,
      unit: item.unit,
      category_id: item.category_id || '',
      min_qty: item.min_qty,
      selling_price: item.selling_price,
      barcode: item.barcode || '',
      recipe: item.recipe.map((r) => ({ ingredient_id: r.ingredient_id, quantity: r.quantity })),
    });
    setPhotoState({ dataUrl: null, remove: false });
    setError('');
    setFormOpen(true);
  }

  function addRecipeLine() {
    setForm({ ...form, recipe: [...form.recipe, { ingredient_id: '', quantity: '' }] });
  }

  function updateRecipeLine(idx, field, value) {
    const recipe = [...form.recipe];
    recipe[idx] = { ...recipe[idx], [field]: value };
    setForm({ ...form, recipe });
  }

  function removeRecipeLine(idx) {
    setForm({ ...form, recipe: form.recipe.filter((_, i) => i !== idx) });
  }

  async function submitForm(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        recipe: form.recipe.filter((r) => r.ingredient_id && r.quantity),
        photo_data: photoState.dataUrl || undefined,
        remove_photo: photoState.remove || undefined,
      };
      if (editing) {
        await api.put(`/products/${editing.id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    }
  }

  function handleOcrText(text) {
    const guess = guessNameFromOcr(text);
    setForm((f) => ({
      ...f,
      name_ar: f.name_ar || guess.ar,
      name_en: f.name_en || guess.en,
    }));
  }

  async function handleQuickScanDetected(code) {
    setQuickScanOpen(false);
    try {
      const res = await api.get(`/lookup/barcode/${encodeURIComponent(code)}`);
      if (res.data.type === 'product') {
        const full = await api.get(`/products/${res.data.item.id}`);
        openEdit(full.data);
      } else {
        alert(t('products.barcodeBelongsToIngredient'));
      }
    } catch (err) {
      if (err.response?.status === 404) {
        openAdd({ barcode: code });
      }
    }
  }

  async function handleDeactivate(item) {
    if (!confirm(t('products.deleteConfirm'))) return;
    await api.delete(`/products/${item.id}`);
    load();
  }

  function openAction(type, item) {
    setActionModal({ type, item });
    setActionQty('');
    setActionNote('');
    setError('');
  }

  async function submitAction(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/products/${actionModal.item.id}/${actionModal.type}`, {
        quantity: Number(actionQty),
        note: actionNote || undefined,
      });
      setActionModal(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    }
  }

  const filteredItems = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      item.name_ar.toLowerCase().includes(q) ||
      item.name_en.toLowerCase().includes(q) ||
      (item.barcode || '').toLowerCase().includes(q)
    );
  });

  function handleExport() {
    exportToExcel(`products-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: t('products.title'),
        rows: filteredItems.map((item) => ({
          [t('common.name')]: isAr ? item.name_ar : item.name_en,
          [t('common.category')]: item.category_id ? (isAr ? item.category_name_ar : item.category_name_en) : '',
          [t('common.stock')]: formatQty(item.stock_qty),
          [t('common.minStock')]: formatQty(item.min_qty),
          [t('common.price')]: item.selling_price,
          [t('common.barcode')]: item.barcode || '',
        })),
      },
    ]);
  }

  return (
    <div>
      <div className="page-header no-print">
        <h1>{t('products.title')}</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            {t('common.exportExcel')}
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            {t('common.print')}
          </button>
          {canManage && (
            <>
              <button className="btn btn-secondary" onClick={() => setQuickScanOpen(true)}>
                {t('products.addByScan')}
              </button>
              <button className="btn btn-primary" onClick={() => openAdd()}>
                + {t('products.addNew')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="toolbar no-print">
        <input
          type="text"
          className="search-box"
          placeholder={t('common.scanOrSearch')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap print-area">
        <table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.category')}</th>
              <th>{t('common.stock')}</th>
              <th>{t('common.price')}</th>
              <th>{t('common.barcode')}</th>
              <th>{t('products.recipe')}</th>
              <th className="no-print">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>{t('common.loading')}</td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  {t('common.noData')}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const low = item.stock_qty <= item.min_qty;
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {item.photo && (
                          <img src={item.photo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                        )}
                        {isAr ? item.name_ar : item.name_en}
                      </div>
                    </td>
                    <td>{item.category_id ? (isAr ? item.category_name_ar : item.category_name_en) : '—'}</td>
                    <td>
                      <span className={`badge ${low ? 'badge-danger' : 'badge-ok'}`}>
                        {formatQty(item.stock_qty)} {item.unit}
                      </span>
                    </td>
                    <td>{item.selling_price}</td>
                    <td>{item.barcode || '—'}</td>
                    <td>
                      {item.recipe.length === 0 ? (
                        <span className="badge badge-muted">{t('products.noRecipe')}</span>
                      ) : (
                        <span className="badge badge-ok">{item.recipe.length}</span>
                      )}
                    </td>
                    <td className="no-print">
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openAction('sale', item)}>
                          {t('products.sell')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openAction('waste', item)}>
                          {t('products.waste')}
                        </button>
                        {item.barcode && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setBarcodeModal(item)}>
                            {t('common.printLabel')}
                          </button>
                        )}
                        {canManage && (
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>
                            {t('common.edit')}
                          </button>
                        )}
                        {user.role === 'admin' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(item)}>
                            {t('common.delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <Modal large title={editing ? t('products.editTitle') : t('products.addNew')} onClose={() => setFormOpen(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={submitForm}>
            <div className="field-row">
              <div className="field">
                <label>{t('products.nameAr')}</label>
                <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} required />
              </div>
              <div className="field">
                <label>{t('products.nameEn')}</label>
                <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} required />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>{t('common.unit')}</label>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
              </div>
              <div className="field">
                <label>{t('common.category')}</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {isAr ? c.name_ar : c.name_en}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>{t('common.minStock')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.min_qty}
                  onChange={(e) => setForm({ ...form, min_qty: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t('common.price')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.selling_price}
                  onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>{t('common.barcode')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                <button type="button" className="btn btn-secondary" onClick={() => setForm({ ...form, barcode: generateBarcode() })}>
                  {t('common.generate')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setFormScannerOpen(true)}>
                  {t('common.scanWithCamera')}
                </button>
              </div>
            </div>

            <PhotoCapture
              photoUrl={editing?.photo}
              onPhotoChange={(dataUrl, remove) => setPhotoState({ dataUrl, remove })}
              onOcrText={handleOcrText}
            />

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '18px 0' }} />
            <label>{t('products.recipe')}</label>
            <p className="text-muted" style={{ marginTop: 0, fontSize: 13 }}>
              {t('products.recipeHint')}
            </p>
            {form.recipe.map((line, idx) => (
              <div className="recipe-line" key={idx}>
                <div>
                  <select
                    value={line.ingredient_id}
                    onChange={(e) => updateRecipeLine(idx, 'ingredient_id', e.target.value)}
                    required
                  >
                    <option value="">—</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {isAr ? ing.name_ar : ing.name_en} ({ing.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="number"
                    step="0.001"
                    placeholder={t('products.perUnit')}
                    value={line.quantity}
                    onChange={(e) => updateRecipeLine(idx, 'quantity', e.target.value)}
                    required
                  />
                </div>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRecipeLine(idx)}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={addRecipeLine}>
              + {t('products.addIngredientLine')}
            </button>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary">
                {t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {actionModal && (
        <Modal title={t(actionModal.type === 'sale' ? 'products.sellTitle' : 'products.wasteTitle')} onClose={() => setActionModal(null)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <p className="text-muted">
            {isAr ? actionModal.item.name_ar : actionModal.item.name_en} — {t('common.stock')}:{' '}
            {formatQty(actionModal.item.stock_qty)} {actionModal.item.unit}
          </p>
          <form onSubmit={submitAction}>
            <div className="field">
              <label>
                {t('common.quantity')} ({actionModal.item.unit})
              </label>
              <input type="number" step="0.01" min="0.01" value={actionQty} onChange={(e) => setActionQty(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t('common.note')}</label>
              <textarea rows={2} value={actionNote} onChange={(e) => setActionNote(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setActionModal(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary">
                {t('common.confirm')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {barcodeModal && (
        <Modal title={t('common.printLabel')} onClose={() => setBarcodeModal(null)}>
          <div className="print-area">
            <div className="barcode-label">
              <div className="label-name">{isAr ? barcodeModal.name_ar : barcodeModal.name_en}</div>
              <div className="label-price">{barcodeModal.selling_price}</div>
              <BarcodeSVG value={barcodeModal.barcode} />
            </div>
          </div>
          <div className="modal-footer no-print">
            <button className="btn btn-secondary" onClick={() => setBarcodeModal(null)}>
              {t('common.close')}
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              {t('common.print')}
            </button>
          </div>
        </Modal>
      )}

      {quickScanOpen && (
        <BarcodeScannerModal onDetected={handleQuickScanDetected} onClose={() => setQuickScanOpen(false)} />
      )}

      {formScannerOpen && (
        <BarcodeScannerModal
          onDetected={(code) => {
            setForm((f) => ({ ...f, barcode: code }));
            setFormScannerOpen(false);
          }}
          onClose={() => setFormScannerOpen(false)}
        />
      )}
    </div>
  );
}
