import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import api from '../lib/api';
import { exportToExcel } from '../lib/excel';
import { formatQty } from '../lib/format';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function weekAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const { t } = useTranslation();
  const isAr = i18n.language === 'ar';
  const name = (row) => (isAr ? row.name_ar : row.name_en);

  const [summary, setSummary] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [from, setFrom] = useState(weekAgoStr());
  const [to, setTo] = useState(todayStr());
  const [loading, setLoading] = useState(true);

  function loadAll() {
    setLoading(true);
    Promise.all([
      api.get('/reports/summary'),
      api.get('/ingredients'),
      api.get('/products'),
      api.get('/movements', { params: { from, to: `${to} 23:59:59` } }),
    ]).then(([s, i, p, m]) => {
      setSummary(s.data);
      setIngredients(i.data);
      setProducts(p.data);
      setMovements(m.data);
      setLoading(false);
    });
  }

  useEffect(loadAll, [from, to]);

  function handleExportAll() {
    exportToExcel(`inventory-report-${todayStr()}`, [
      {
        name: t('reports.ingredientsReport'),
        rows: ingredients.map((i) => ({
          [t('common.name')]: name(i),
          [t('common.unit')]: i.unit,
          [t('common.stock')]: formatQty(i.stock_qty),
          [t('common.minStock')]: formatQty(i.min_qty),
          [t('common.cost')]: i.cost_per_unit,
          [t('common.barcode')]: i.barcode || '',
        })),
      },
      {
        name: t('reports.productsReport'),
        rows: products.map((p) => ({
          [t('common.name')]: name(p),
          [t('common.unit')]: p.unit,
          [t('common.stock')]: formatQty(p.stock_qty),
          [t('common.minStock')]: formatQty(p.min_qty),
          [t('common.price')]: p.selling_price,
          [t('common.barcode')]: p.barcode || '',
        })),
      },
      {
        name: t('reports.movementsReport'),
        rows: movements.map((m) => ({
          [t('common.date')]: m.created_at,
          [t('movements.item')]: isAr ? m.item_name_ar : m.item_name_en,
          [t('movements.movementType')]: t(`movements.type.${m.movement_type}`),
          [t('common.quantity')]: formatQty(m.quantity),
          [t('common.user')]: m.user_name || '',
          [t('common.notes')]: m.note || '',
        })),
      },
    ]);
  }

  if (loading || !summary) return <p>{t('common.loading')}</p>;

  const lowStock = [...summary.lowStockIngredients, ...summary.lowStockProducts];

  return (
    <div>
      <div className="page-header no-print">
        <h1>{t('reports.title')}</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExportAll}>
            {t('reports.exportFullReport')}
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            {t('reports.printFullReport')}
          </button>
        </div>
      </div>

      <div className="toolbar no-print">
        <div className="report-filters">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('reports.from')}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('reports.to')}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="print-area">
        <div className="report-header">
          <div>
            <h1>{t('reports.shopName')}</h1>
            <div className="report-meta">
              {t('reports.generatedAt')}: {new Date().toLocaleString()}
            </div>
          </div>
        </div>

        <div className="report-section">
          <h2>{t('reports.inventorySummary')}</h2>
          <table>
            <tbody>
              <tr>
                <td>{t('dashboard.totalIngredients')}</td>
                <td>
                  <strong>{summary.counts.ingredients}</strong>
                </td>
                <td>{t('dashboard.totalProducts')}</td>
                <td>
                  <strong>{summary.counts.products}</strong>
                </td>
              </tr>
              <tr>
                <td>{t('dashboard.ingredientsValue')}</td>
                <td>
                  <strong>{formatQty(summary.inventoryValue.ingredients)}</strong>
                </td>
                <td>{t('dashboard.productsValue')}</td>
                <td>
                  <strong>{formatQty(summary.inventoryValue.products)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>{t('reports.lowStockReport')}</h2>
          {lowStock.length === 0 ? (
            <p className="text-muted">{t('dashboard.noLowStock')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.stock')}</th>
                  <th>{t('common.minStock')}</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((row) => (
                  <tr key={`${row.id}-${name(row)}`}>
                    <td>{name(row)}</td>
                    <td>
                      {formatQty(row.stock_qty)} {row.unit}
                    </td>
                    <td>
                      {formatQty(row.min_qty)} {row.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="report-section">
          <h2>{t('reports.ingredientsReport')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.stock')}</th>
                <th>{t('common.minStock')}</th>
                <th>{t('common.cost')}</th>
                <th>{t('common.barcode')}</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((i) => (
                <tr key={i.id}>
                  <td>{name(i)}</td>
                  <td>
                    {formatQty(i.stock_qty)} {i.unit}
                  </td>
                  <td>
                    {formatQty(i.min_qty)} {i.unit}
                  </td>
                  <td>{i.cost_per_unit}</td>
                  <td>{i.barcode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>{t('reports.productsReport')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.stock')}</th>
                <th>{t('common.minStock')}</th>
                <th>{t('common.price')}</th>
                <th>{t('common.barcode')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{name(p)}</td>
                  <td>
                    {formatQty(p.stock_qty)} {p.unit}
                  </td>
                  <td>
                    {formatQty(p.min_qty)} {p.unit}
                  </td>
                  <td>{p.selling_price}</td>
                  <td>{p.barcode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>
            {t('reports.movementsReport')} ({from} → {to})
          </h2>
          {movements.length === 0 ? (
            <p className="text-muted">{t('common.noData')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('movements.item')}</th>
                  <th>{t('movements.movementType')}</th>
                  <th>{t('common.quantity')}</th>
                  <th>{t('common.user')}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                    <td>{isAr ? m.item_name_ar : m.item_name_en}</td>
                    <td>{t(`movements.type.${m.movement_type}`)}</td>
                    <td>
                      {formatQty(m.quantity)} {m.item_unit}
                    </td>
                    <td>{m.user_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
