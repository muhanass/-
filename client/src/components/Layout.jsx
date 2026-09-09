import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { setLanguage } from '../i18n';
import i18n from '../i18n';

export default function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: '/', label: t('nav.dashboard'), roles: ['admin', 'chef', 'staff'] },
    { to: '/ingredients', label: t('nav.ingredients'), roles: ['admin', 'chef', 'staff'] },
    { to: '/products', label: t('nav.products'), roles: ['admin', 'chef', 'staff'] },
    { to: '/production', label: t('nav.production'), roles: ['admin', 'chef'] },
    { to: '/movements', label: t('nav.movements'), roles: ['admin', 'chef', 'staff'] },
    { to: '/reports', label: t('nav.reports'), roles: ['admin', 'chef', 'staff'] },
    { to: '/suppliers', label: t('nav.suppliers'), roles: ['admin', 'chef'] },
    { to: '/users', label: t('nav.users'), roles: ['admin'] },
  ];

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const roleLabelKey = { admin: 'login.role.admin', chef: 'login.role.chef', staff: 'login.role.staff' };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">🍽️ {t('appName')}</div>
        <nav>
          {links
            .filter((l) => l.roles.includes(user?.role))
            .map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {l.label}
              </NavLink>
            ))}
        </nav>
        <button className="btn btn-secondary" onClick={handleLogout} style={{ marginTop: 12 }}>
          {t('nav.logout')}
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="lang-toggle">
            <button
              className={i18n.language === 'ar' ? 'active' : ''}
              onClick={() => setLanguage('ar')}
            >
              العربية
            </button>
            <button
              className={i18n.language === 'en' ? 'active' : ''}
              onClick={() => setLanguage('en')}
            >
              English
            </button>
          </div>
          <div className="topbar-right">
            <div className="user-chip">
              <span>{user?.name}</span>
              <span className="role-badge">{t(roleLabelKey[user?.role] || '')}</span>
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
