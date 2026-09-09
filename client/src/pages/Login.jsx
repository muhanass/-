import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { setLanguage } from '../i18n';
import i18n from '../i18n';

const DEMO_ACCOUNTS = [
  { email: 'admin@shop.com', password: 'admin123', roleKey: 'login.role.admin' },
  { email: 'chef@shop.com', password: 'chef123', roleKey: 'login.role.chef' },
  { email: 'staff@shop.com', password: 'staff123', roleKey: 'login.role.staff' },
];

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(acc) {
    setEmail(acc.email);
    setPassword(acc.password);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="lang-toggle" style={{ margin: '0 auto 20px', width: 'fit-content' }}>
          <button className={i18n.language === 'ar' ? 'active' : ''} onClick={() => setLanguage('ar')}>
            العربية
          </button>
          <button className={i18n.language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>
            English
          </button>
        </div>
        <h1>{t('login.title')}</h1>
        <p className="subtitle">{t('login.subtitle')}</p>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>{t('login.email')}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>{t('login.password')}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {t('login.submit')}
          </button>
        </form>
        <div className="demo-accounts">
          <div>{t('login.demoAccounts')}</div>
          {DEMO_ACCOUNTS.map((acc) => (
            <button key={acc.email} type="button" onClick={() => fillDemo(acc)}>
              {t(acc.roleKey)} — {acc.email} / {acc.password}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
