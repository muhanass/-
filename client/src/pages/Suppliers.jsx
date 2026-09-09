import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';

const emptyForm = { name_ar: '', name_en: '', phone: '', notes: '' };

export default function Suppliers() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAr = i18n.language === 'ar';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.get('/suppliers').then((r) => {
      setItems(r.data);
      setLoading(false);
    });
  }

  useEffect(load, []);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setFormOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({ name_ar: item.name_ar, name_en: item.name_en, phone: item.phone || '', notes: item.notes || '' });
    setError('');
    setFormOpen(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await api.put(`/suppliers/${editing.id}`, form);
      } else {
        await api.post('/suppliers', form);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    }
  }

  async function handleDelete(item) {
    if (!confirm(t('common.delete') + '?')) return;
    await api.delete(`/suppliers/${item.id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t('suppliers.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>
          + {t('suppliers.addNew')}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.phone')}</th>
              <th>{t('common.notes')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>{t('common.loading')}</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  {t('common.noData')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{isAr ? item.name_ar : item.name_en}</td>
                  <td>{item.phone || '—'}</td>
                  <td>{item.notes || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>
                        {t('common.edit')}
                      </button>
                      {user.role === 'admin' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <Modal title={editing ? t('suppliers.editTitle') : t('suppliers.addNew')} onClose={() => setFormOpen(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={submitForm}>
            <div className="field-row">
              <div className="field">
                <label>{t('suppliers.nameAr')}</label>
                <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} required />
              </div>
              <div className="field">
                <label>{t('suppliers.nameEn')}</label>
                <input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} required />
              </div>
            </div>
            <div className="field">
              <label>{t('common.phone')}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('common.notes')}</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
    </div>
  );
}
