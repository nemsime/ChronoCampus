import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { GraduationCap, ArrowLeft, Moon, Sun, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Mail, Shield } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { LanguageSelector } from './LanguageSelector';
import { useTheme } from 'next-themes@0.4.6';
import { toast } from 'sonner';

interface ForgotPasswordProps {
  onBack: () => void;
  language: 'en' | 'hy' | 'ru';
  onLanguageChange: (lang: 'en' | 'hy' | 'ru') => void;
}

type ResetStep = 'email' | 'verify' | 'reset';

const translations = {
  en: {
    title: 'Reset Password',
    subtitle: 'National Polytechnic University of Armenia',
    emailStep: 'Enter Your Email',
    emailLabel: 'Email Address',
    emailPlaceholder: 'namesurname.tt319@polytechnic.am',
    emailDesc: 'Enter your university email to receive a verification code',
    verifyStep: 'Verify Code',
    verifyLabel: 'Enter 6-Digit Code',
    verificationSent: 'We sent a verification code to',
    resetStep: 'Create New Password',
    newPasswordLabel: 'New Password',
    newPasswordPlaceholder: 'Enter new password',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Re-enter new password',
    sendCode: 'Send Code',
    sending: 'Sending...',
    verify: 'Verify Code',
    verifying: 'Verifying...',
    resetPassword: 'Reset Password',
    resetting: 'Resetting...',
    back: 'Back to Login',
    resendCode: 'Didn\'t receive code?',
    resend: 'Resend',
    emailError: 'Please enter a valid @polytechnic.am email address',
    codeError: 'Please enter the complete 6-digit code',
    passwordError: 'Password must be at least 8 characters',
    passwordMismatch: 'Passwords do not match',
    codeSent: 'Verification code sent!',
    codeVerified: 'Code verified successfully!',
    success: 'Password reset successfully!',
    requirements: 'Create a strong password with at least 8 characters'
  },
  hy: {
    title: 'Վերականգնել Գաղտնաբառը',
    subtitle: 'Հայաստանի Ազգային Պոլիտեխնիկական Համալսարան',
    emailStep: 'Մուտքագրեք Ձեր Էլ․ Հասցեն',
    emailLabel: 'Էլեկտրոնային Հասցե',
    emailPlaceholder: 'անունազգանուն.tt319@polytechnic.am',
    emailDesc: 'Մուտքագրեք ձեր համալսարանական էլ․ հասցեն ստուգիչ կոդ ստանալու համար',
    verifyStep: 'Ստուգել Կոդը',
    verifyLabel: 'Մուտքագրեք 6-Նիշ Կոդը',
    verificationSent: 'Մենք ուղարկել ենք ստուգիչ կոդ',
    resetStep: 'Ստեղծել Նոր Գաղտնաբառ',
    newPasswordLabel: 'Նոր Գաղտնաբառ',
    newPasswordPlaceholder: 'Մուտքագրեք նոր գաղտնաբառը',
    confirmPasswordLabel: 'Հաստատել Գաղտնաբառը',
    confirmPasswordPlaceholder: 'Կրկին մուտքագրեք գաղտնաբառը',
    sendCode: 'Ուղարկել Կոդը',
    sending: 'Ուղարկում...',
    verify: 'Ստուգել Կոդը',
    verifying: 'Ստուգում...',
    resetPassword: 'Վերականգնել Գաղտնաբառը',
    resetting: 'Վերականգնում...',
    back: 'Վերադառնալ Մուտք',
    resendCode: 'Չե՞ք ստացել կոդը',
    resend: 'Կրկին ուղարկել',
    emailError: 'Խնդրում ենք մուտքագրել վավեր @polytechnic.am էլ․ հասցե',
    codeError: 'Խնդրում ենք մուտքագրել ամբողջական 6-նիշ կոդը',
    passwordError: 'Գաղտնաբառը պետք է լինի առնվազն 8 նիշ',
    passwordMismatch: 'Գաղտնաբառերը չեն համընկնում',
    codeSent: 'Ստուգիչ կոդը ուղարկվել է!',
    codeVerified: 'Կոդը հաջողությամբ ստուգվել է!',
    success: 'Գաղտնաբառը հաջողությամբ վերականգնվել է!',
    requirements: 'Ստեղծեք ուժեղ գաղտնաբառ առնվազն 8 նիշով'
  },
  ru: {
    title: 'Сброс Пароля',
    subtitle: 'Национальный Политехнический Университет Армении',
    emailStep: 'Введите Ваш Email',
    emailLabel: 'Адрес Электронной Почты',
    emailPlaceholder: 'имяфамилия.tt319@polytechnic.am',
    emailDesc: 'Введите ваш университетский email для получения кода подтверждения',
    verifyStep: 'Проверить Код',
    verifyLabel: 'Введите 6-Значный Код',
    verificationSent: 'Мы отправили код подтверждения на',
    resetStep: 'Создать Новый Пароль',
    newPasswordLabel: 'Новый Пароль',
    newPasswordPlaceholder: 'Введите новый пароль',
    confirmPasswordLabel: 'Подтвердите Пароль',
    confirmPasswordPlaceholder: 'Повторите пароль',
    sendCode: 'Отправить Код',
    sending: 'Отправка...',
    verify: 'Проверить Код',
    verifying: 'Проверка...',
    resetPassword: 'Сбросить Пароль',
    resetting: 'Сброс...',
    back: 'Вернуться к Входу',
    resendCode: 'Не получили код?',
    resend: 'Отправить повторно',
    emailError: 'Пожалуйста, введите действительный адрес @polytechnic.am',
    codeError: 'Пожалуйста, введите полный 6-значный код',
    passwordError: 'Пароль должен содержать не менее 8 символов',
    passwordMismatch: 'Пароли не совпадают',
    codeSent: 'Код подтверждения отправлен!',
    codeVerified: 'Код успешно проверен!',
    success: 'Пароль успешно сброшен!',
    requirements: 'Создайте надежный пароль из не менее 8 символов'
  }
};

export function ForgotPassword({ onBack, language, onLanguageChange }: ForgotPasswordProps) {
  const [step, setStep] = useState<ResetStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const t = translations[language];
  const { theme, setTheme } = useTheme();

  // Validation
  const isEmailValid = email.endsWith('@polytechnic.am') && email.length > 15;
  const showEmailError = emailTouched && !isEmailValid && email.length > 0;
  const isPasswordValid = newPassword.length >= 8;
  const showPasswordError = passwordTouched && !isPasswordValid && newPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const showMatchError = confirmTouched && !passwordsMatch && confirmPassword.length > 0;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);

    if (!isEmailValid) {
      toast.error(t.emailError);
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      toast.success(t.codeSent);
      setStep('verify');
      setIsLoading(false);
    }, 1500);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (code.length !== 6) {
      toast.error(t.codeError);
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      toast.success(t.codeVerified);
      setStep('reset');
      setIsLoading(false);
    }, 1500);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    setConfirmTouched(true);

    if (!isPasswordValid) {
      toast.error(t.passwordError);
      return;
    }

    if (!passwordsMatch) {
      toast.error(t.passwordMismatch);
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      toast.success(t.success);
      setTimeout(() => {
        onBack();
      }, 1000);
    }, 1500);
  };

  const handleResendCode = () => {
    setIsLoading(true);
    setTimeout(() => {
      toast.success(t.codeSent);
      setIsLoading(false);
    }, 1000);
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

      {/* Reset Password Card */}
      <div className="w-full max-w-[460px] relative z-10">
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-200/60 dark:border-gray-800/60 overflow-hidden transition-all duration-500 hover:shadow-[0_12px_48px_rgba(0,0,0,0.16)] dark:hover:shadow-[0_12px_48px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="px-8 sm:px-10 pt-12 pb-8 text-center border-b border-gray-100/80 dark:border-gray-800/80">
            <div className="flex justify-center mb-5">
              <div className="w-[72px] h-[72px] rounded-[20px] bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-500 group">
                <GraduationCap className="w-10 h-10 text-white group-hover:scale-110 transition-transform duration-500" />
              </div>
            </div>
            <h1 className="text-[28px] font-semibold text-gray-900 dark:text-gray-100 mb-2.5 tracking-tight">
              {t.title}
            </h1>
            <p className="text-[15px] text-gray-600 dark:text-gray-400 leading-relaxed max-w-[320px] mx-auto">
              {t.subtitle}
            </p>
            
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2 mt-6">
              {/* Step 1: Email */}
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
                  step === 'email' 
                    ? 'bg-slate-700 dark:bg-slate-600 text-white shadow-lg scale-110' 
                    : step === 'verify' || step === 'reset'
                    ? 'bg-green-500 dark:bg-green-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {step === 'verify' || step === 'reset' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-medium">1</span>
                  )}
                </div>
              </div>
              
              {/* Connector Line */}
              <div className={`h-0.5 w-8 sm:w-12 transition-all duration-300 ${
                step === 'verify' || step === 'reset'
                  ? 'bg-green-500 dark:bg-green-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`} />
              
              {/* Step 2: Verify */}
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
                  step === 'verify'
                    ? 'bg-slate-700 dark:bg-slate-600 text-white shadow-lg scale-110'
                    : step === 'reset'
                    ? 'bg-green-500 dark:bg-green-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {step === 'reset' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-medium">2</span>
                  )}
                </div>
              </div>
              
              {/* Connector Line */}
              <div className={`h-0.5 w-8 sm:w-12 transition-all duration-300 ${
                step === 'reset'
                  ? 'bg-green-500 dark:bg-green-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`} />
              
              {/* Step 3: Reset */}
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ${
                  step === 'reset'
                    ? 'bg-slate-700 dark:bg-slate-600 text-white shadow-lg scale-110'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  <span className="text-xs font-medium">3</span>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 sm:px-10 py-8">
            {/* Email Step */}
            {step === 'email' && (
              <form onSubmit={handleEmailSubmit} className="space-y-5">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-3">
                    <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {t.emailStep}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t.emailDesc}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t.emailLabel}
                  </Label>
                  <div className="relative">
                    <Input
                      id="reset-email"
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

                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full h-11 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 dark:from-slate-700 dark:to-slate-800 dark:hover:from-slate-600 dark:hover:to-slate-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t.sending}
                    </>
                  ) : (
                    t.sendCode
                  )}
                </Button>
              </form>
            )}

            {/* Verify Step */}
            {step === 'verify' && (
              <form onSubmit={handleVerifySubmit} className="space-y-5">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-3">
                    <Shield className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {t.verifyStep}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t.verificationSent}
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                    {email}
                  </p>
                </div>

                <div className="space-y-4">
                  <Label htmlFor="code" className="text-sm font-medium text-gray-700 dark:text-gray-300 block text-center">
                    {t.verifyLabel}
                  </Label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={code} onChange={setCode} disabled={isLoading}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} className="dark:bg-gray-950 dark:border-gray-700" />
                        <InputOTPSlot index={1} className="dark:bg-gray-950 dark:border-gray-700" />
                        <InputOTPSlot index={2} className="dark:bg-gray-950 dark:border-gray-700" />
                        <InputOTPSlot index={3} className="dark:bg-gray-950 dark:border-gray-700" />
                        <InputOTPSlot index={4} className="dark:bg-gray-950 dark:border-gray-700" />
                        <InputOTPSlot index={5} className="dark:bg-gray-950 dark:border-gray-700" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={isLoading || code.length !== 6}
                  className="w-full h-11 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 dark:from-slate-700 dark:to-slate-800 dark:hover:from-slate-600 dark:hover:to-slate-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t.verifying}
                    </>
                  ) : (
                    t.verify
                  )}
                </Button>

                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">
                    {t.resendCode}
                  </p>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isLoading}
                    className="text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 font-medium transition-colors disabled:opacity-50"
                  >
                    {t.resend}
                  </button>
                </div>
              </form>
            )}

            {/* Reset Password Step */}
            {step === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {t.resetStep}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t.requirements}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t.newPasswordLabel}
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder={t.newPasswordPlaceholder}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      disabled={isLoading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                    >
                      {showNewPassword ? (
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t.confirmPasswordLabel}
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder={t.confirmPasswordPlaceholder}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setConfirmTouched(true)}
                      disabled={isLoading}
                      className={`h-11 pr-10 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-all ${
                        showMatchError 
                          ? 'border-red-300 dark:border-red-800 focus:border-red-500 focus:ring-red-500/20' 
                          : passwordsMatch
                          ? 'border-green-300 dark:border-green-800 focus:border-green-500 focus:ring-green-500/20'
                          : 'focus:border-slate-400 focus:ring-slate-400/20 dark:focus:border-slate-600 dark:focus:ring-slate-600/20'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={isLoading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                    >
                      {showConfirmPassword ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                    {passwordsMatch && (
                      <CheckCircle2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600 dark:text-green-500" />
                    )}
                  </div>
                  {showMatchError && (
                    <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {t.passwordMismatch}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full h-11 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 dark:from-slate-700 dark:to-slate-800 dark:hover:from-slate-600 dark:hover:to-slate-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t.resetting}
                    </>
                  ) : (
                    t.resetPassword
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 pb-8">
            <button
              onClick={onBack}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.back}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}