import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import api from '../lib/api';
import { formatQty } from '../lib/format';

const MOVEMENT_TYPES = ['purchase_in', 'production_out', 'production_in', 'sale_out', 'waste', 'adjustment'];

export default function Movements() {
  const { t } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [rows, setRows] = useState([]);
  const [itemType, setItemType] = useState('');
  const [movementType, setMovementType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (itemType) params.itemType = itemType;
    if (movementType) params.movementType = movementType;
    api.get('/movements', { params }).then((r) => {
      setRows(r.data);
      setLoading(false);
    });
  }, [itemType, movementType]);

  function badgeTone(type) {
    if (type.endsWith('_in')) return 'badge-ok';
    if (type === 'waste') return 'badge-danger';
    if (type === 'adjustment') return 'badge-muted';
    return 'badge-warning';
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t('movements.title')}</h1>
      </div>

      <div className="toolbar">
        <select value={itemType} onChange={(e) => setItemType(e.target.value)} style={{ width: 180 }}>
          <option value="">{t('common.all')} — {t('movements.itemType')}</option>
          <option value="ingredient">{t('movements.ingredient')}</option>
          <option value="product">{t('movements.product')}</option>
        </select>
        <select value={movementType} onChange={(e) => setMovementType(e.target.value)} style={{ width: 220 }}>
          <option value="">{t('common.all')} — {t('movements.movementType')}</option>
          {MOVEMENT_TYPES.map((mt) => (
            <option key={mt} value={mt}>
              {t(`movements.type.${mt}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('movements.item')}</th>
              <th>{t('movements.movementType')}</th>
              <th>{t('common.quantity')}</th>
              <th>{t('common.user')}</th>
              <th>{t('common.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>{t('common.loading')}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  {t('common.noData')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{isAr ? row.item_name_ar : row.item_name_en}</td>
                  <td>
                    <span className={`badge ${badgeTone(row.movement_type)}`}>{t(`movements.type.${row.movement_type}`)}</span>
                  </td>
                  <td>
                    {formatQty(row.quantity)} {row.item_unit}
                  </td>
                  <td>{row.user_name || '—'}</td>
                  <td>{row.note || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
