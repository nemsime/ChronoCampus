import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  language: 'en' | 'hy' | 'ru';
  email: string;
}

const translations = {
  en: {
    title: 'Change Your Password',
    description: 'As an administrator, you must change your password on first login for security purposes.',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmPassword: 'Confirm New Password',
    requirements: 'Password Requirements:',
    req1: 'At least 12 characters',
    req2: 'One uppercase letter',
    req3: 'One lowercase letter',
    req4: 'One number',
    req5: 'One special character (!@#$%^&*)',
    passwordsDontMatch: 'Passwords do not match',
    weakPassword: 'Password does not meet requirements',
    changePassword: 'Change Password',
    changing: 'Changing...',
    cancel: 'Cancel',
    passwordChanged: 'Password changed successfully',
    error: 'Failed to change password',
    currentPasswordPlaceholder: 'Enter current password',
    newPasswordPlaceholder: 'Enter new password',
    confirmPasswordPlaceholder: 'Re-enter new password'
  },
  hy: {
    title: 'Փոխեք Ձեր Գաղտնաբառը',
    description: 'Որպես ադմինիստրատոր, դուք պետք է փոխեք ձեր գաղտնաբառը առաջին մուտքի ժամանակ անվտանգության նպատակներով։',
    currentPassword: 'Ընթացիկ Գաղտնաբառ',
    newPassword: 'Նոր Գաղտնաբառ',
    confirmPassword: 'Հաստատել Նոր Գաղտնաբառը',
    requirements: 'Գաղտնաբառի Պահանջներ։',
    req1: 'Առնվազն 12 նիշ',
    req2: 'Մեկ մեծատառ',
    req3: 'Մեկ փոքրատառ',
    req4: 'Մեկ թիվ',
    req5: 'Մեկ հատուկ նիշ (!@#$%^&*)',
    passwordsDontMatch: 'Գաղտնաբառերը չեն համընկնում',
    weakPassword: 'Գաղտնաբառը չի համապատասխանում պահանջներին',
    changePassword: 'Փոխել Գաղտնաբառը',
    changing: 'Փոխում...',
    cancel: 'Չեղարկել',
    passwordChanged: 'Գաղտնաբառը հաջողությամբ փոխվել է',
    error: 'Գաղտնաբառը փոխելու փորձը ձախողվեց',
    currentPasswordPlaceholder: 'Մուտքագրեք ընթացիկ գաղտնաբառը',
    newPasswordPlaceholder: 'Մուտքագրեք նոր գաղտնաբառը',
    confirmPasswordPlaceholder: 'Կրկին մուտքագրեք նոր գաղտնաբառը'
  },
  ru: {
    title: 'Смените Ваш Пароль',
    description: 'Как администратор, вы должны сменить пароль при первом входе в целях безопасности.',
    currentPassword: 'Текущий Пароль',
    newPassword: 'Новый Пароль',
    confirmPassword: 'Подтвердите Новый Пароль',
    requirements: 'Требования к паролю:',
    req1: 'Минимум 12 символов',
    req2: 'Одна заглавная буква',
    req3: 'Одна строчная буква',
    req4: 'Одна цифра',
    req5: 'Один спецсимвол (!@#$%^&*)',
    passwordsDontMatch: 'Пароли не совпадают',
    weakPassword: 'Пароль не соответствует требованиям',
    changePassword: 'Сменить Пароль',
    changing: 'Смена...',
    cancel: 'Отмена',
    passwordChanged: 'Пароль успешно изменен',
    error: 'Не удалось изменить пароль',
    currentPasswordPlaceholder: 'Введите текущий пароль',
    newPasswordPlaceholder: 'Введите новый пароль',
    confirmPasswordPlaceholder: 'Повторите новый пароль'
  }
};

export function ChangePasswordDialog({ open, onClose, onComplete, language, email }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const t = translations[language];

  // Password strength validation
  const hasMinLength = newPassword.length >= 12;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecialChar = /[!@#$%^&*]/.test(newPassword);

  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordValid) {
      toast.error(t.weakPassword);
      return;
    }

    if (!passwordsMatch) {
      toast.error(t.passwordsDontMatch);
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      try {
        // In real app, this would be an API call to change password
        // For now, we'll just simulate success
        toast.success(t.passwordChanged);
        onComplete();
        // Reset form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (error) {
        toast.error(t.error);
      } finally {
        setIsLoading(false);
      }
    }, 1500);
  };

  const RequirementItem = ({ met, text }: { met: boolean; text: string }) => (
    <div className={`flex items-center gap-2 text-xs transition-colors ${
      met ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'
    }`}>
      <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${met ? 'opacity-100' : 'opacity-30'}`} />
      <span>{text}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-[480px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-950/50 dark:to-amber-900/50 flex items-center justify-center shadow-md">
              <Lock className="w-5 h-5 text-amber-700 dark:text-amber-500" />
            </div>
            <DialogTitle className="text-xl text-gray-900 dark:text-gray-100">
              {t.title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {t.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="current-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t.currentPassword}
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder={t.currentPasswordPlaceholder}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isLoading}
                required
                className="pr-10 h-10 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {showCurrentPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t.newPassword}
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                placeholder={t.newPasswordPlaceholder}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
                required
                className="pr-10 h-10 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {showNewPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>

            {/* Password Requirements */}
            {newPassword.length > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t.requirements}</p>
                <div className="space-y-1.5">
                  <RequirementItem met={hasMinLength} text={t.req1} />
                  <RequirementItem met={hasUppercase} text={t.req2} />
                  <RequirementItem met={hasLowercase} text={t.req3} />
                  <RequirementItem met={hasNumber} text={t.req4} />
                  <RequirementItem met={hasSpecialChar} text={t.req5} />
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t.confirmPassword}
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder={t.confirmPasswordPlaceholder}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
                className={`pr-10 h-10 bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 ${
                  confirmPassword.length > 0 && !passwordsMatch
                    ? 'border-red-300 dark:border-red-800'
                    : passwordsMatch
                    ? 'border-green-300 dark:border-green-800'
                    : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {showConfirmPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {t.passwordsDontMatch}
              </p>
            )}
            {passwordsMatch && (
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Passwords match
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !isPasswordValid || !passwordsMatch}
              className="flex-1 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 dark:from-slate-700 dark:to-slate-800 dark:hover:from-slate-600 dark:hover:to-slate-700 text-white shadow-lg hover:shadow-xl disabled:opacity-50 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.changing}
                </>
              ) : (
                t.changePassword
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}