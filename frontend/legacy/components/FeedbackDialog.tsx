import { useState, forwardRef } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { translations } from '../constants/translations';
import { toast } from 'sonner';

interface FeedbackDialogProps {
  language: 'en' | 'hy' | 'ru';
  userRole: 'student' | 'lecturer';
  userName: string;
  variant?: 'button' | 'fab';
}

export function FeedbackDialog({ language, userRole, userName, variant = 'button' }: FeedbackDialogProps) {
  const t = translations[language];
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'problem' as 'problem' | 'suggestion' | 'question' | 'other'
  });

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    // Create feedback object
    const feedback = {
      id: Date.now().toString(),
      title: formData.title,
      message: formData.message,
      type: formData.type,
      status: 'pending' as const,
      from: userName,
      role: userRole,
      date: new Date().toISOString(),
    };

    // Get existing feedback from localStorage
    const existingFeedback = JSON.parse(localStorage.getItem('chronocampus_feedback') || '[]');
    
    // Add new feedback
    existingFeedback.push(feedback);
    
    // Save to localStorage
    localStorage.setItem('chronocampus_feedback', JSON.stringify(existingFeedback));

    // Show success message
    toast.success(t.feedbackSent);

    // Reset form and close dialog
    setFormData({ title: '', message: '', type: 'problem' });
    setIsOpen(false);
  };

  // Floating Action Button (FAB) Trigger
  if (variant === 'fab') {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button
            className="group fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 dark:from-violet-600 dark:to-purple-700 dark:hover:from-violet-700 dark:hover:to-purple-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center active:scale-95 sm:w-16 sm:h-16"
            aria-label={t.sendFeedback}
          >
            <MessageSquare className="h-6 w-6 sm:h-7 sm:w-7 group-hover:scale-110 transition-transform" />
            {/* CSS Tooltip */}
            <span className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 dark:bg-gray-800 text-white dark:text-gray-100 text-sm rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap pointer-events-none">
              {t.sendFeedback}
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">{t.sendFeedback}</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">{t.feedbackDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-gray-700 dark:text-gray-300">{t.feedbackTitle}</Label>
              <Input
                id="title"
                placeholder={t.feedbackTitlePlaceholder}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="bg-white dark:bg-gray-900/50 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type" className="text-gray-700 dark:text-gray-300">{t.feedbackType}</Label>
              <Select
                value={formData.type}
                onValueChange={(value: 'problem' | 'suggestion' | 'question' | 'other') =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-900/50 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="problem">{t.problem}</SelectItem>
                  <SelectItem value="suggestion">{t.suggestion}</SelectItem>
                  <SelectItem value="question">{t.question}</SelectItem>
                  <SelectItem value="other">{t.other}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message" className="text-gray-700 dark:text-gray-300">{t.feedbackMessage}</Label>
              <Textarea
                id="message"
                placeholder={t.writeFeedback}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={6}
                className="resize-none bg-white dark:bg-gray-900/50 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/30">
              {t.cancel}
            </Button>
            <Button onClick={handleSubmit} className="gap-2 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 dark:from-violet-600 dark:to-purple-700 dark:hover:from-violet-700 dark:hover:to-purple-800 text-white">
              <Send className="h-4 w-4" />
              {t.submitFeedback}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Regular Button Trigger
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/30">
          <MessageSquare className="h-4 w-4" />
          {t.sendFeedback}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">{t.sendFeedback}</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">{t.feedbackDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-gray-700 dark:text-gray-300">{t.feedbackTitle}</Label>
            <Input
              id="title"
              placeholder={t.feedbackTitlePlaceholder}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="bg-white dark:bg-gray-900/50 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type" className="text-gray-700 dark:text-gray-300">{t.feedbackType}</Label>
            <Select
              value={formData.type}
              onValueChange={(value: 'problem' | 'suggestion' | 'question' | 'other') =>
                setFormData({ ...formData, type: value })
              }
            >
              <SelectTrigger className="bg-white dark:bg-gray-900/50 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectItem value="problem">{t.problem}</SelectItem>
                <SelectItem value="suggestion">{t.suggestion}</SelectItem>
                <SelectItem value="question">{t.question}</SelectItem>
                <SelectItem value="other">{t.other}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message" className="text-gray-700 dark:text-gray-300">{t.feedbackMessage}</Label>
            <Textarea
              id="message"
              placeholder={t.writeFeedback}
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              rows={6}
              className="resize-none bg-white dark:bg-gray-900/50 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/30">
            {t.cancel}
          </Button>
          <Button onClick={handleSubmit} className="gap-2 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 dark:from-violet-600 dark:to-purple-700 dark:hover:from-violet-700 dark:hover:to-purple-800 text-white">
            <Send className="h-4 w-4" />
            {t.submitFeedback}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}