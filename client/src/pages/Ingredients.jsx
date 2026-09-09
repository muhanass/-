import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import api from '../lib/api';
import Modal from '../components/Modal';
import BarcodeSVG from '../components/BarcodeSVG';
import { useAuth } from '../context/AuthContext';
import { formatQty } from '../lib/format';
import { exportToExcel } from '../lib/excel';
import { generateBarcode } from '../lib/barcodeGen';

const emptyForm = {
  name_ar: '',
  name_en: '',
  unit: '',
  category_id: '',
  supplier_id: '',
  min_qty: 0,
  cost_per_unit: 0,
  stock_qty: 0,
  barcode: '',
};

export default function Ingredients() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAr = i18n.language === 'ar';
  const canManage = user.role === 'admin' || user.role === 'chef';

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [actionModal, setActionModal] = useState(null); // { type: 'purchase'|'waste'|'adjust', item }
  const [actionQty, setActionQty] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [error, setError] = useState('');
  const [barcodeModal, setBarcodeModal] = useState(null);

  async function load() {
    setLoading(true);
    const res = await api.get('/ingredients', { params: lowStockOnly ? { lowStock: true } : {} });
    setItems(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    api.get('/categories', { params: { type: 'ingredient' } }).then((r) => setCategories(r.data));
    api.get('/suppliers').then((r) => setSuppliers(r.data));
  }, [lowStockOnly]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
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
      supplier_id: item.supplier_id || '',
      min_qty: item.min_qty,
      cost_per_unit: item.cost_per_unit,
      stock_qty: item.stock_qty,
      barcode: item.barcode || '',
    });
    setError('');
    setFormOpen(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
      };
      if (editing) {
        await api.put(`/ingredients/${editing.id}`, payload);
      } else {
        await api.post('/ingredients', payload);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    }
  }

  async function handleDeactivate(item) {
    if (!confirm(t('ingredients.deleteConfirm'))) return;
    await api.delete(`/ingredients/${item.id}`);
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
      await api.post(`/ingredients/${actionModal.item.id}/${actionModal.type}`, {
        quantity: Number(actionQty),
        note: actionNote || undefined,
      });
      setActionModal(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    }
  }

  const actionTitles = {
    purchase: t('ingredients.purchaseTitle'),
    waste: t('ingredients.wasteTitle'),
    adjust: t('ingredients.adjustTitle'),
  };

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
    exportToExcel(`ingredients-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: t('ingredients.title'),
        rows: filteredItems.map((item) => ({
          [t('common.name')]: isAr ? item.name_ar : item.name_en,
          [t('common.category')]: item.category_id ? (isAr ? item.category_name_ar : item.category_name_en) : '',
          [t('common.stock')]: formatQty(item.stock_qty),
          [t('common.minStock')]: formatQty(item.min_qty),
          [t('common.cost')]: item.cost_per_unit,
          [t('common.barcode')]: item.barcode || '',
        })),
      },
    ]);
  }

  return (
    <div>
      <div className="page-header no-print">
        <h1>{t('ingredients.title')}</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            {t('common.exportExcel')}
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            {t('common.print')}
          </button>
          {canManage && (
            <button className="btn btn-primary" onClick={openAdd}>
              + {t('ingredients.addNew')}
            </button>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          {t('ingredients.lowStockOnly')}
        </label>
      </div>

      <div className="table-wrap print-area">
        <table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.category')}</th>
              <th>{t('common.stock')}</th>
              <th>{t('common.minStock')}</th>
              <th>{t('common.cost')}</th>
              <th>{t('common.barcode')}</th>
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
                    <td>{isAr ? item.name_ar : item.name_en}</td>
                    <td>{item.category_id ? (isAr ? item.category_name_ar : item.category_name_en) : '—'}</td>
                    <td>
                      <span className={`badge ${low ? 'badge-danger' : 'badge-ok'}`}>
                        {formatQty(item.stock_qty)} {item.unit}
                      </span>
                    </td>
                    <td>
                      {formatQty(item.min_qty)} {item.unit}
                    </td>
                    <td>{item.cost_per_unit}</td>
                    <td>{item.barcode || '—'}</td>
                    <td className="no-print">
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openAction('purchase', item)}>
                          {t('ingredients.purchase')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openAction('waste', item)}>
                          {t('ingredients.waste')}
                        </button>
                        {item.barcode && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setBarcodeModal(item)}>
                            {t('common.printLabel')}
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button className="btn btn-secondary btn-sm" onClick={() => openAction('adjust', item)}>
                              {t('ingredients.adjust')}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>
                              {t('common.edit')}
                            </button>
                          </>
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
        <Modal title={editing ? t('ingredients.editTitle') : t('ingredients.addNew')} onClose={() => setFormOpen(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={submitForm}>
            <div className="field-row">
              <div className="field">
                <label>{t('ingredients.nameAr')}</label>
                <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} required />
              </div>
              <div className="field">
                <label>{t('ingredients.nameEn')}</label>
                <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} required />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>{t('common.unit')}</label>
                <input
                  value={form.unit}
                  placeholder={t('ingredients.unitPlaceholder')}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  required
                />
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
                <label>{t('common.supplier')}</label>
                <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">—</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {isAr ? s.name_ar : s.name_en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('common.cost')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cost_per_unit}
                  onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })}
                />
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
              {!editing && (
                <div className="field">
                  <label>{t('common.stock')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.stock_qty}
                    onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="field">
              <label>{t('common.barcode')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                <button type="button" className="btn btn-secondary" onClick={() => setForm({ ...form, barcode: generateBarcode() })}>
                  {t('common.generate')}
                </button>
              </div>
            </div>
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
        <Modal title={actionTitles[actionModal.type]} onClose={() => setActionModal(null)}>
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
              <input type="number" step="0.01" value={actionQty} onChange={(e) => setActionQty(e.target.value)} required />
              {actionModal.type === 'adjust' && <small className="text-muted">{t('ingredients.adjustHint')}</small>}
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
    </div>
  );
}
