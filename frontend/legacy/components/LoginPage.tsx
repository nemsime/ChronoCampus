import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { GraduationCap, Eye, EyeOff, Moon, Sun, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PrivacyPolicy } from './PrivacyPolicy';
import { TermsOfService } from './TermsOfService';
import { LanguageSelector } from './LanguageSelector';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { useTheme } from 'next-themes@0.4.6';
import { toast } from 'sonner';

interface LoginPageProps {
  onLogin: (isAdmin: boolean, email: string) => void;
  onForgotPassword: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

type Language = 'en' | 'hy' | 'ru';

const translations = {
  en: {
    title: 'ChronoCampus',
    subtitle: 'National Polytechnic University of Armenia',
    microsoftButton: 'Sign in with Microsoft',
    microsoftSubtext: 'University Email',
    or: 'or',
    secondaryAccessToggle: 'Administrator or no university email? Sign in here',
    emailPlaceholder: 'Enter your email',
    passwordPlaceholder: 'Enter your password',
    forgotPassword: 'Forgot password?',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    authenticating: 'Authenticating with Microsoft...',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
    emailError: 'Please enter a valid email address',
    passwordError: 'Password must be at least 8 characters',
    loginError: 'Invalid email or password',
    accountNotActivated: 'Your account is not yet activated. Please contact the academic office.',
    accountNotFound: 'No account found with this email. Please contact the academic office.',
    microsoftError: 'Microsoft authentication failed. Please try again.',
    loginSuccess: 'Login successful',
    welcomeBack: 'Welcome back',
    and: 'and'
  },
  hy: {
    title: 'ChronoCampus',
    subtitle: 'Հայաստանի Ազգային Պոլիտեխնիկական Համալսարան',
    microsoftButton: 'Մուտք Microsoft-ով',
    microsoftSubtext: 'Համալսարանական Էլ․ Հասցե',
    or: 'կամ',
    secondaryAccessToggle: 'Ադմինիստրատո՞ր եք կամ չունե՞ք համալսարանական էլ․ հասցե։ Մուտք գործեք այստեղ',
    emailPlaceholder: 'Մուտքագրեք ձեր էլ․ հասցեն',
    passwordPlaceholder: 'Մուտքագրեք ձեր գաղտնաբառը',
    forgotPassword: 'Մոռացե՞լ եք գաղտնաբառը',
    signIn: 'Մուտք',
    signingIn: 'Մուտք գործում...',
    authenticating: 'Նույնականացում Microsoft-ի միջոցով...',
    privacyPolicy: 'Գաղտնիության Քաղաքականություն',
    termsOfService: 'Օգտագործման Պայմաններ',
    emailError: 'Խնդրում ենք մուտքագրել վավեր էլ․ հասցե',
    passwordError: 'Գաղտնաբառը պետք է լինի առնվազն 8 նիշ',
    loginError: 'Անվավեր էլ․ հասցե կամ գաղտնաբառ',
    accountNotActivated: 'Ձեր հաշիվը դեռ ակտիվացված չէ։ Խնդրում ենք կապվել ակադեմիական գրասենյակի հետ։',
    accountNotFound: 'Այս էլ․ հասցեով հաշիվ չի գտնվել։ Խնդրում ենք կապվել ակադեմիական գրասենյակի հետ։',
    microsoftError: 'Microsoft նույնականացումը ձախողվեց։ Խնդրում ենք կրկին փորձել։',
    loginSuccess: 'Մուտքը հաջող է',
    welcomeBack: 'Բարի վերադարձ',
    and: 'և'
  },
  ru: {
    title: 'ChronoCampus',
    subtitle: 'Национальный Политехнический Университет Армении',
    microsoftButton: 'Войти через Microsoft',
    microsoftSubtext: 'Университетский Email',
    or: 'или',
    secondaryAccessToggle: 'Администратор или нет университетского email? Войдите здесь',
    emailPlaceholder: 'Введите ваш email',
    passwordPlaceholder: 'Введите ваш пароль',
    forgotPassword: 'Забыли пароль?',
    signIn: 'Войти',
    signingIn: 'Вход...',
    authenticating: 'Аутентификация через Microsoft...',
    privacyPolicy: 'Политика Конфиденциальности',
    termsOfService: 'Условия Использования',
    emailError: 'Пожалуйста, введите действительный email адрес',
    passwordError: 'Пароль должен содержать не менее 8 символов',
    loginError: 'Неверный email или пароль',
    accountNotActivated: 'Ваш аккаунт еще не активирован. Пожалуйста, свяжитесь с учебным офисом.',
    accountNotFound: 'Аккаунт с этим email не найден. Пожалуйста, свяжитесь с учебным офисом.',
    microsoftError: 'Ошибка аутентификации Microsoft. Пожалуйста, попробуйте снова.',
    loginSuccess: 'Вход выполнен успешно',
    welcomeBack: 'С возвращением',
    and: 'и'
  }
};

// Mock function to check if admin needs password change
const checkAdminFirstLogin = (email: string): boolean => {
  const adminFirstLoginKey = `admin_first_login_${email}`;
  const hasChangedPassword = localStorage.getItem(adminFirstLoginKey);
  return hasChangedPassword !== 'true';
};

// Microsoft Icon Component
const MicrosoftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="11" height="11" fill="#F25022"/>
    <rect x="12" width="11" height="11" fill="#7FBA00"/>
    <rect y="12" width="11" height="11" fill="#00A4EF"/>
    <rect x="12" y="12" width="11" height="11" fill="#FFB900"/>
  </svg>
);

export function LoginPage({ onLogin, onForgotPassword, language, onLanguageChange }: LoginPageProps) {
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [pendingAdminEmail, setPendingAdminEmail] = useState('');

  const t = translations[language];
  const { theme, setTheme } = useTheme();

  // Email validation
  const isEmailValid = email.includes('@') && email.length > 3;
  const showEmailError = emailTouched && !isEmailValid && email.length > 0;

  // Password validation
  const isPasswordValid = password.length >= 8;
  const showPasswordError = passwordTouched && !isPasswordValid && password.length > 0;

  // Handle Microsoft OAuth Login
  const handleMicrosoftLogin = async () => {
    setError('');
    setIsMicrosoftLoading(true);

    // Simulate Microsoft OAuth flow
    setTimeout(() => {
      try {
        // Mock Microsoft authentication
        // In real app, this would redirect to Microsoft OAuth endpoint
        
        // Simulate successful authentication
        const mockMicrosoftEmail = 'johnsmith.tt319@polytechnic.am'; // Mock email from Microsoft
        
        // Simulate database lookup - check if account exists and is activated
        const accountExists = Math.random() > 0.1; // 90% chance account exists
        const isActivated = Math.random() > 0.2; // 80% chance account is activated

        if (!accountExists) {
          // Account not found in database
          setError(t.accountNotFound);
          setIsMicrosoftLoading(false);
          return;
        }

        if (!isActivated) {
          // Account exists but not activated yet
          setError(t.accountNotActivated);
          setIsMicrosoftLoading(false);
          return;
        }

        // Success - role will be determined by server based on database records
        // Mock response from server with role information
        const mockUserRole = Math.random() > 0.5 ? 'student' : 'lecturer'; // Server determines role
        const isAdmin = false; // Microsoft OAuth users are never admins

        toast.success(`${t.welcomeBack}!`);
        onLogin(isAdmin, mockMicrosoftEmail);
      } catch (err) {
        setError(t.microsoftError);
        setIsMicrosoftLoading(false);
      }
    }, 2000);
  };

  // Handle Email/Password Login (for exceptional access and administrators)
  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Mark fields as touched
    setEmailTouched(true);
    setPasswordTouched(true);

    // Validate email format
    if (!isEmailValid) {
      setError(t.emailError);
      return;
    }

    // Validate password length
    if (!isPasswordValid) {
      setError(t.passwordError);
      return;
    }

    setIsLoading(true);

    // Simulate API call - server determines if user exists, role, and validates password
    setTimeout(() => {
      try {
        // Mock authentication
        const mockValidPassword = 'password123';
        
        if (password === mockValidPassword) {
          // Simulate database lookup - server returns user role
          // Role is NOT determined by email pattern, but by database records
          const mockUserData = {
            email: email,
            role: email.includes('admin') ? 'admin' : 'student', // Server determines this
            isFirstLogin: Math.random() > 0.5
          };

          const isAdmin = mockUserData.role === 'admin';
          
          // Check if user needs to change password on first login (applies to ALL email/password users)
          if (mockUserData.isFirstLogin) {
            setPendingAdminEmail(email);
            setShowPasswordChange(true);
            setIsLoading(false);
            return;
          }
          
          // Success
          toast.success(`${t.welcomeBack}!`);
          onLogin(isAdmin, email);
        } else {
          setError(t.loginError);
          setIsLoading(false);
        }
      } catch (err) {
        setError(t.loginError);
        setIsLoading(false);
      }
    }, 1500);
  };

  const handlePasswordChangeComplete = () => {
    setShowPasswordChange(false);
    localStorage.setItem(`user_first_login_${pendingAdminEmail}`, 'true');
    toast.success(t.loginSuccess);
    
    // Determine if admin based on stored email pattern (in real app, this comes from server)
    const isAdmin = pendingAdminEmail.includes('admin');
    onLogin(isAdmin, pendingAdminEmail);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-gray-950 dark:via-slate-950 dark:to-gray-950 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 flex items-center gap-3">
        <Button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          variant="outline"
          size="icon"
          className="h-9 w-9 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 hover:scale-110 hover:shadow-lg transition-all duration-300 hover:border-gray-300 dark:hover:border-gray-700"
        >
          {theme === 'dark' ? 
            <Sun className="w-[18px] h-[18px] text-amber-500 transition-transform duration-700" /> : 
            <Moon className="w-[18px] h-[18px] text-slate-700 transition-transform duration-300" />
          }
        </Button>
        <LanguageSelector 
          language={language} 
          onLanguageChange={onLanguageChange} 
          className="!relative !top-0 !right-0" 
        />
      </div>

      {/* Login Card */}
      <div className="w-full max-w-[460px] relative z-10">
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-200/60 dark:border-gray-800/60 overflow-hidden transition-all duration-500 hover:shadow-[0_12px_48px_rgba(0,0,0,0.16)] dark:hover:shadow-[0_12px_48px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="px-6 sm:px-8 pt-6 pb-5 text-center border-b border-gray-100/80 dark:border-gray-800/80 flex flex-col items-center justify-center">
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-500 group">
                <GraduationCap className="w-8 h-8 text-white group-hover:scale-110 transition-transform duration-500" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1.5 tracking-tight">
              {t.title}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-[320px] mx-auto min-h-[40px] flex items-center justify-center">
              {t.subtitle}
            </p>
          </div>

          {/* Main Login Section */}
          <div className="px-6 sm:px-8 py-6">
            {/* Microsoft OAuth Button */}
            <Button
              onClick={handleMicrosoftLogin}
              disabled={isMicrosoftLoading || isLoading}
              className="w-full h-14 min-h-[56px] bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-2 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600 shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isMicrosoftLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  <span className="truncate">{t.authenticating}</span>
                </>
              ) : (
                <>
                  <MicrosoftIcon />
                  <div className="ml-3 flex flex-col items-start">
                    <span className="text-sm font-medium whitespace-nowrap">{t.microsoftButton}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap">{t.microsoftSubtext}</span>
                  </div>
                </>
              )}
            </Button>

            {/* Error Message (Account Not Activated or Microsoft Error) */}
            {error && !showAdminLogin && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </p>
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
              <span className="text-sm text-gray-500 dark:text-gray-500">{t.or}</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
            </div>

            {/* Exceptional Access Toggle - Subtle Text Link */}
            <div className="text-center min-h-[32px] flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowAdminLogin(!showAdminLogin)}
                disabled={isMicrosoftLoading || isLoading}
                className="text-xs text-gray-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-50 underline decoration-dotted underline-offset-2 leading-tight"
              >
                {t.secondaryAccessToggle}
              </button>
            </div>

            {/* Email/Password Login Form (Expandable - for exceptional access and admins) */}
            {showAdminLogin && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
                <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
                  {/* Email Field */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        id="admin-email"
                        type="email"
                        placeholder={t.emailPlaceholder}
                        value={email}
                        onChange={(e) => setEmail(e.target.value.toLowerCase())}
                        onBlur={() => setEmailTouched(true)}
                        disabled={isLoading}
                        className={`h-11 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-all ${
                          showEmailError 
                            ? 'border-red-300 dark:border-red-800 focus:border-red-500 focus:ring-red-500/20' 
                            : emailTouched && isEmailValid
                            ? 'border-green-300 dark:border-green-800 focus:border-green-500 focus:ring-green-500/20'
                            : 'focus:border-slate-400 focus:ring-slate-400/20 dark:focus:border-slate-600 dark:focus:ring-slate-600/20'
                        }`}
                      />
                      {emailTouched && isEmailValid && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600 dark:text-green-500" />
                      )}
                      {showEmailError && (
                        <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-600 dark:text-red-500" />
                      )}
                    </div>
                    {showEmailError && (
                      <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t.emailError}
                      </p>
                    )}
                  </div>

                  {/* Password Field */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        id="admin-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={t.passwordPlaceholder}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => setPasswordTouched(true)}
                        disabled={isLoading}
                        className={`h-11 pr-10 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-all ${
                          showPasswordError 
                            ? 'border-red-300 dark:border-red-800 focus:border-red-500 focus:ring-red-500/20' 
                            : 'focus:border-slate-400 focus:ring-slate-400/20 dark:focus:border-slate-600 dark:focus:ring-slate-600/20'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLoading}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                      >
                        {showPassword ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {showPasswordError && (
                      <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t.passwordError}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={onForgotPassword}
                        className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                      >
                        {t.forgotPassword}
                      </button>
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && showAdminLogin && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg">
                      <p className="text-sm text-red-800 dark:text-red-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                      </p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full h-11 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 dark:from-slate-700 dark:to-slate-800 dark:hover:from-slate-600 dark:hover:to-slate-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t.signingIn}
                      </>
                    ) : (
                      t.signIn
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 sm:px-8 pb-6">
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex justify-center items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
                <button 
                  type="button"
                  onClick={() => setShowPrivacyPolicy(true)}
                  className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  {t.privacyPolicy}
                </button>
                <span>{t.and}</span>
                <button 
                  type="button"
                  onClick={() => setShowTerms(true)}
                  className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  {t.termsOfService}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Policy Dialog */}
      <PrivacyPolicy 
        open={showPrivacyPolicy} 
        onClose={() => setShowPrivacyPolicy(false)}
        language={language}
      />

      {/* Terms of Service Dialog */}
      <TermsOfService 
        open={showTerms} 
        onClose={() => setShowTerms(false)}
        language={language}
      />

      {/* Change Password Dialog (for first-time admin login) */}
      <ChangePasswordDialog
        open={showPasswordChange}
        onClose={() => {
          setShowPasswordChange(false);
          setIsLoading(false);
        }}
        onComplete={handlePasswordChangeComplete}
        language={language}
        email={pendingAdminEmail}
      />
    </div>
  );
}