import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import api from '../lib/api';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { formatQty } from '../lib/format';

function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/summary').then((res) => {
      setData(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <p>{t('common.loading')}</p>;

  const isAr = i18n.language === 'ar';
  const name = (row) => (isAr ? row.name_ar : row.name_en);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <p className="page-subtitle">
            {t('dashboard.welcome')}, {user?.name}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label={t('dashboard.totalIngredients')} value={data.counts.ingredients} />
        <StatCard label={t('dashboard.totalProducts')} value={data.counts.products} />
        <StatCard
          label={t('dashboard.lowStockIngredients')}
          value={data.counts.lowStockIngredients}
          tone={data.counts.lowStockIngredients > 0 ? 'danger' : ''}
        />
        <StatCard
          label={t('dashboard.lowStockProducts')}
          value={data.counts.lowStockProducts}
          tone={data.counts.lowStockProducts > 0 ? 'warn' : ''}
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="mt-0">{t('dashboard.lowStockAlerts')}</h3>
          {data.lowStockIngredients.length === 0 && data.lowStockProducts.length === 0 ? (
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
                {[...data.lowStockIngredients, ...data.lowStockProducts].map((row) => (
                  <tr key={`${row.id}-${name(row)}`}>
                    <td>{name(row)}</td>
                    <td>
                      <span className="badge badge-danger">
                        {formatQty(row.stock_qty)} {row.unit}
                      </span>
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

        <div className="card">
          <h3 className="mt-0">{t('dashboard.inventoryValue')}</h3>
          <table>
            <tbody>
              <tr>
                <td>{t('dashboard.ingredientsValue')}</td>
                <td>
                  <strong>{fmtMoney(data.inventoryValue.ingredients)}</strong>
                </td>
              </tr>
              <tr>
                <td>{t('dashboard.productsValue')}</td>
                <td>
                  <strong>{fmtMoney(data.inventoryValue.products)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <h3>{t('dashboard.topProduced')}</h3>
          {data.topProducedThisWeek.length === 0 ? (
            <p className="text-muted">{t('common.noData')}</p>
          ) : (
            <table>
              <tbody>
                {data.topProducedThisWeek.map((row) => (
                  <tr key={row.name_en}>
                    <td>{isAr ? row.name_ar : row.name_en}</td>
                    <td>{formatQty(row.total)}</td>
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
