import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';

const emptyForm = { name: '', email: '', password: '', role: 'staff', active: true };

export default function Users() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.get('/users').then((r) => {
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
    setForm({ name: item.name, email: item.email, password: '', role: item.role, active: !!item.active });
    setError('');
    setFormOpen(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        const payload = { name: form.name, role: form.role, active: form.active };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editing.id}`, payload);
      } else {
        await api.post('/users', form);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    }
  }

  async function handleDelete(item) {
    if (!confirm(t('common.delete') + '?')) return;
    try {
      await api.delete(`/users/${item.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error');
    }
  }

  const roleLabel = { admin: t('users.roleAdmin'), chef: t('users.roleChef'), staff: t('users.roleStaff') };

  return (
    <div>
      <div className="page-header">
        <h1>{t('users.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>
          + {t('users.addNew')}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('users.name')}</th>
              <th>{t('users.email')}</th>
              <th>{t('users.role')}</th>
              <th>{t('users.active')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>{t('common.loading')}</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.email}</td>
                  <td>
                    <span className="badge badge-ok">{roleLabel[item.role]}</span>
                  </td>
                  <td>{item.active ? t('common.yes') : t('common.no')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>
                        {t('common.edit')}
                      </button>
                      {item.id !== currentUser.id && (
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
        <Modal title={editing ? t('users.editTitle') : t('users.addNew')} onClose={() => setFormOpen(false)}>
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={submitForm}>
            <div className="field">
              <label>{t('users.name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            {!editing && (
              <div className="field">
                <label>{t('users.email')}</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
            )}
            <div className="field">
              <label>{t('users.password')}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? t('users.leaveBlank') : ''}
                required={!editing}
              />
            </div>
            <div className="field">
              <label>{t('users.role')}</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">{t('users.roleAdmin')}</option>
                <option value="chef">{t('users.roleChef')}</option>
                <option value="staff">{t('users.roleStaff')}</option>
              </select>
            </div>
            {editing && (
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  {t('users.active')}
                </label>
              </div>
            )}
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
