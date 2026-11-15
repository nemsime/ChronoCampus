import { useState, useEffect } from 'react';
import { MessageSquare, Search, CheckCircle, Clock, AlertCircle, User, Send, Flag, X, Calendar as CalendarIcon, FileText } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { translations } from '../../constants/translations';
import { toast } from 'sonner';

interface Comment {
  id: string;
  user: string;
  role: 'admin' | 'user';
  message: string;
  timestamp: string;
}

interface Feedback {
  id: string;
  title: string;
  message: string;
  type: 'problem' | 'suggestion' | 'question' | 'other';
  status: 'pending' | 'inProgress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  from: string;
  role: 'student' | 'lecturer';
  date: string;
  comments: Comment[];
  lastUpdated?: string;
}

interface FeedbackManagementProps {
  language: 'en' | 'hy' | 'ru';
}

const feedbackTranslations = {
  en: {
    boardView: 'Board View',
    listView: 'List View',
    allFeedback: 'All Feedback',
    writeComment: 'Write your comment here...',
    postComment: 'Post',
    priority: 'Priority',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    noPending: 'No pending feedback',
    noInProgress: 'Nothing in progress',
    noResolved: 'No resolved feedback',
    comments: 'Comments',
    noComments: 'No comments yet. Start the conversation!',
    originalMessage: 'Original Message',
    submittedBy: 'Submitted by',
    on: 'on',
    lastUpdated: 'Last updated',
    changePriority: 'Change Priority',
    changeStatus: 'Change Status',
    moveTo: 'Move to',
    searchPlaceholder: 'Search by title, message, or submitter...',
    filterByType: 'Filter by Type',
    filterByPriority: 'Filter by Priority',
    allTypes: 'All Types',
    allPriorities: 'All Priorities',
    clearFilters: 'Clear Filters',
    items: 'items',
    cmdEnter: 'Press Cmd/Ctrl + Enter to post',
  },
  hy: {
    boardView: 'Տախտակի Տեսք',
    listView: 'Ցանկի Տեսք',
    allFeedback: 'Բոլոր Արձագանքները',
    writeComment: 'Գրեք ձեր մեկնաբանությունը այստեղ...',
    postComment: 'Հրապարակել',
    priority: 'Առաջնահերթություն',
    low: 'Ցածր',
    medium: 'Միջին',
    high: 'Բարձր',
    noPending: 'Սպասող արձագանք չկա',
    noInProgress: 'Ընթացքում ոչինչ չկա',
    noResolved: 'Լուծված արձագանք չկա',
    comments: 'Մեկնաբանություններ',
    noComments: 'Մեկնաբանություններ դեռ չկան։ Սկսեք զրույցը։',
    originalMessage: 'Սկզբնական Հաղորդագրություն',
    submittedBy: 'Ներկայացրել է',
    on: '-ին',
    lastUpdated: 'Վերջին թարմացում',
    changePriority: 'Փոխել Առաջնահերթությունը',
    changeStatus: 'Փոխել Կարգավիճակը',
    moveTo: 'Տեղափոխել',
    searchPlaceholder: 'Փնտրել վերնագրով, հաղորդագրությամբ կամ ներկայացնողով...',
    filterByType: 'Զտել Տեսակով',
    filterByPriority: 'Զտել Առաջնահերթությամբ',
    allTypes: 'Բոլոր Տեսակները',
    allPriorities: 'Բոլոր Առաջնահերթությունները',
    clearFilters: 'Մաքրել Զտիչները',
    items: 'տարրեր',
    cmdEnter: 'Սեղմեք Cmd/Ctrl + Enter հրապարակելու համար',
  },
  ru: {
    boardView: 'Вид Доски',
    listView: 'Вид Списка',
    allFeedback: 'Вся Обратная Связь',
    writeComment: 'Напишите ваш комментарий здесь...',
    postComment: 'Опубликовать',
    priority: 'Приоритет',
    low: 'Низкий',
    medium: 'Средний',
    high: 'Высокий',
    noPending: 'Нет ожидающей обратной связи',
    noInProgress: 'Ничего в процессе',
    noResolved: 'Нет решенной обратной связи',
    comments: 'Комментарии',
    noComments: 'Комментариев пока нет. Начните разговор!',
    originalMessage: 'Исходное Сообщение',
    submittedBy: 'Отправлено',
    on: '-',
    lastUpdated: 'Последнее обновление',
    changePriority: 'Изменить Приоритет',
    changeStatus: 'Изменить Статус',
    moveTo: 'Переместить в',
    searchPlaceholder: 'Поиск по названию, сообщению или отправителю...',
    filterByType: 'Фильтр по Типу',
    filterByPriority: 'Фильтр по Приоритету',
    allTypes: 'Все Типы',
    allPriorities: 'Все Приоритеты',
    clearFilters: 'Очистить Фильтры',
    items: 'элементов',
    cmdEnter: 'Нажмите Cmd/Ctrl + Enter для публикации',
  }
};

export function FeedbackManagement({ language }: FeedbackManagementProps) {
  const t = translations[language];
  const ft = feedbackTranslations[language];
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Load feedback from localStorage
  useEffect(() => {
    const loadFeedback = () => {
      const saved = localStorage.getItem('chronocampus_feedback');
      if (saved) {
        const parsedFeedback = JSON.parse(saved);
        const updatedFeedback = parsedFeedback.map((f: any) => ({
          ...f,
          priority: f.priority || 'medium',
          comments: f.comments || [],
          lastUpdated: f.lastUpdated || f.date
        }));
        setFeedbackList(updatedFeedback);
      }
    };

    loadFeedback();
    const interval = setInterval(loadFeedback, 2000);
    return () => clearInterval(interval);
  }, []);

  const saveFeedback = (updated: Feedback[]) => {
    setFeedbackList(updated);
    localStorage.setItem('chronocampus_feedback', JSON.stringify(updated));
  };

  const updateFeedback = (id: string, updates: Partial<Feedback>) => {
    const updated = feedbackList.map((f) =>
      f.id === id ? { ...f, ...updates, lastUpdated: new Date().toISOString() } : f
    );
    saveFeedback(updated);

    if (selectedFeedback?.id === id) {
      setSelectedFeedback({ ...selectedFeedback, ...updates, lastUpdated: new Date().toISOString() });
    }
  };

  const updateFeedbackStatus = (id: string, newStatus: 'pending' | 'inProgress' | 'resolved') => {
    updateFeedback(id, { status: newStatus });
    
    const statusLabels = {
      pending: t.pending,
      inProgress: t.inProgress,
      resolved: t.resolved
    };
    
    toast.success(`Status updated to ${statusLabels[newStatus]}`);
  };

  const updateFeedbackPriority = (id: string, newPriority: 'low' | 'medium' | 'high') => {
    updateFeedback(id, { priority: newPriority });
    
    const priorityLabels = {
      low: ft.low,
      medium: ft.medium,
      high: ft.high
    };
    
    toast.success(`Priority updated to ${priorityLabels[newPriority]}`);
  };

  const addComment = () => {
    if (!selectedFeedback || !newComment.trim()) return;

    const comment: Comment = {
      id: Date.now().toString(),
      user: 'Admin',
      role: 'admin',
      message: newComment.trim(),
      timestamp: new Date().toISOString()
    };

    const updatedComments = [...selectedFeedback.comments, comment];
    updateFeedback(selectedFeedback.id, { comments: updatedComments });

    setSelectedFeedback({ ...selectedFeedback, comments: updatedComments });
    setNewComment('');
    toast.success('Comment added');
  };

  const filteredFeedback = feedbackList.filter((feedback) => {
    const matchesSearch =
      feedback.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feedback.from.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'all' || feedback.type === typeFilter;
    const matchesPriority = priorityFilter === 'all' || feedback.priority === priorityFilter;

    return matchesSearch && matchesType && matchesPriority;
  });

  const pendingFeedback = filteredFeedback.filter(f => f.status === 'pending');
  const inProgressFeedback = filteredFeedback.filter(f => f.status === 'inProgress');
  const resolvedFeedback = filteredFeedback.filter(f => f.status === 'resolved');

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-500 dark:border-l-red-400';
      case 'medium':
        return 'border-l-orange-500 dark:border-l-orange-400';
      case 'low':
        return 'border-l-gray-400 dark:border-l-gray-500';
      default:
        return 'border-l-gray-300 dark:border-l-gray-600';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'low':
        return (
          <Badge variant="outline" className="text-gray-600 border-gray-400 text-xs dark:text-gray-400 dark:border-gray-500">
            {ft.low}
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs dark:text-orange-400 dark:border-orange-500">
            {ft.medium}
          </Badge>
        );
      case 'high':
        return (
          <Badge variant="outline" className="text-red-600 border-red-400 text-xs dark:text-red-400 dark:border-red-500">
            {ft.high}
          </Badge>
        );
      default:
        return null;
    }
  };

  const getTypeBadge = (type: string) => {
    const configs: Record<string, { className: string; label: string }> = {
      problem: { 
        className: 'bg-red-50 text-red-700 border-red-200 text-xs dark:bg-red-950/50 dark:text-red-400 dark:border-red-800', 
        label: t.problem 
      },
      suggestion: { 
        className: 'bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800', 
        label: t.suggestion 
      },
      question: { 
        className: 'bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800', 
        label: t.question 
      },
      other: { 
        className: 'bg-gray-50 text-gray-700 border-gray-200 text-xs dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700', 
        label: t.other 
      },
    };

    const config = configs[type] || configs.other;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const FeedbackCard = ({ feedback }: { feedback: Feedback }) => (
    <Card
      className={`mb-3 cursor-pointer hover:shadow-md transition-all border-l-4 ${getPriorityColor(feedback.priority)} dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-750`}
      onClick={() => {
        setSelectedFeedback(feedback);
        setIsDialogOpen(true);
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-sm line-clamp-2 flex-1 dark:text-gray-100">{feedback.title}</h4>
          {getPriorityBadge(feedback.priority)}
        </div>
        
        <p className="text-xs text-gray-600 line-clamp-2 mb-3 dark:text-gray-400">
          {feedback.message}
        </p>

        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {getTypeBadge(feedback.type)}
            <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-300">
              {feedback.role === 'student' ? t.student : t.lecturer}
            </Badge>
          </div>
          {feedback.comments.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <MessageSquare className="h-3 w-3" />
              {feedback.comments.length}
            </div>
          )}
        </div>

        <div className="pt-2 border-t dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span className="truncate max-w-[60%]">{feedback.from}</span>
          <span className="whitespace-nowrap">{formatTimestamp(feedback.date)}</span>
        </div>
      </CardContent>
    </Card>
  );

  const EmptyColumn = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-gray-400 dark:text-gray-500">
      <MessageSquare className="h-10 w-10 mb-3 opacity-50" />
      <p className="text-sm text-center">{message}</p>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-hidden">
        <div className="max-w-[1800px] mx-auto w-full flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="mb-4 lg:mb-6 flex-shrink-0">
            <h1 className="mb-1 dark:text-gray-100">{t.feedbackManagement}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t.viewFeedback}</p>
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-col sm:flex-row gap-3 flex-shrink-0">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="text"
                placeholder={ft.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>

            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px] dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <SelectValue placeholder={ft.filterByType} />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all" className="dark:text-gray-100 dark:focus:bg-gray-700">{ft.allTypes}</SelectItem>
                  <SelectItem value="problem" className="dark:text-gray-100 dark:focus:bg-gray-700">{t.problem}</SelectItem>
                  <SelectItem value="suggestion" className="dark:text-gray-100 dark:focus:bg-gray-700">{t.suggestion}</SelectItem>
                  <SelectItem value="question" className="dark:text-gray-100 dark:focus:bg-gray-700">{t.question}</SelectItem>
                  <SelectItem value="other" className="dark:text-gray-100 dark:focus:bg-gray-700">{t.other}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[180px] dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <SelectValue placeholder={ft.filterByPriority} />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all" className="dark:text-gray-100 dark:focus:bg-gray-700">{ft.allPriorities}</SelectItem>
                  <SelectItem value="high" className="dark:text-gray-100 dark:focus:bg-gray-700">{ft.high}</SelectItem>
                  <SelectItem value="medium" className="dark:text-gray-100 dark:focus:bg-gray-700">{ft.medium}</SelectItem>
                  <SelectItem value="low" className="dark:text-gray-100 dark:focus:bg-gray-700">{ft.low}</SelectItem>
                </SelectContent>
              </Select>

              {(searchTerm || typeFilter !== 'all' || priorityFilter !== 'all') && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm('');
                    setTypeFilter('all');
                    setPriorityFilter('all');
                  }}
                  className="w-full sm:w-auto dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-750"
                  size="icon"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Kanban Board */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 flex-1 overflow-hidden">
            {/* Pending Column */}
            <div className="flex flex-col bg-white dark:bg-gray-850 rounded-lg border dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <h3 className="text-sm dark:text-gray-100">{t.pending}</h3>
                  <Badge variant="secondary" className="text-xs h-5 min-w-5 px-1.5 dark:bg-gray-700 dark:text-gray-300">
                    {pendingFeedback.length}
                  </Badge>
                </div>
              </div>
              <ScrollArea className="flex-1 p-3 bg-gray-50 dark:bg-gray-900">
                {pendingFeedback.length === 0 ? (
                  <EmptyColumn message={ft.noPending} />
                ) : (
                  <div className="space-y-0">
                    {pendingFeedback.map((feedback) => (
                      <FeedbackCard key={feedback.id} feedback={feedback} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* In Progress Column */}
            <div className="flex flex-col bg-white dark:bg-gray-850 rounded-lg border dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <h3 className="text-sm dark:text-gray-100">{t.inProgress}</h3>
                  <Badge variant="secondary" className="text-xs h-5 min-w-5 px-1.5 dark:bg-gray-700 dark:text-gray-300">
                    {inProgressFeedback.length}
                  </Badge>
                </div>
              </div>
              <ScrollArea className="flex-1 p-3 bg-gray-50 dark:bg-gray-900">
                {inProgressFeedback.length === 0 ? (
                  <EmptyColumn message={ft.noInProgress} />
                ) : (
                  <div className="space-y-0">
                    {inProgressFeedback.map((feedback) => (
                      <FeedbackCard key={feedback.id} feedback={feedback} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Resolved Column */}
            <div className="flex flex-col bg-white dark:bg-gray-850 rounded-lg border dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h3 className="text-sm dark:text-gray-100">{t.resolved}</h3>
                  <Badge variant="secondary" className="text-xs h-5 min-w-5 px-1.5 dark:bg-gray-700 dark:text-gray-300">
                    {resolvedFeedback.length}
                  </Badge>
                </div>
              </div>
              <ScrollArea className="flex-1 p-3 bg-gray-50 dark:bg-gray-900">
                {resolvedFeedback.length === 0 ? (
                  <EmptyColumn message={ft.noResolved} />
                ) : (
                  <div className="space-y-0">
                    {resolvedFeedback.map((feedback) => (
                      <FeedbackCard key={feedback.id} feedback={feedback} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Feedback Detail Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[700px] h-[90vh] max-h-[800px] p-0 flex flex-col dark:bg-gray-800 dark:border-gray-700" aria-describedby="feedback-detail-description">
            {selectedFeedback && (
              <>
                {/* Header */}
                <DialogHeader className="px-4 sm:px-6 py-4 border-b dark:border-gray-700 flex-shrink-0">
                  <div className="space-y-2">
                    <DialogTitle className="text-lg sm:text-xl leading-tight dark:text-gray-100">
                      {selectedFeedback.title}
                    </DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      {ft.submittedBy} {selectedFeedback.from} {ft.on} {new Date(selectedFeedback.date).toLocaleDateString()}
                    </DialogDescription>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {getTypeBadge(selectedFeedback.type)}
                      {getPriorityBadge(selectedFeedback.priority)}
                      <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-300">
                        {selectedFeedback.role === 'student' ? t.student : t.lecturer}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                {/* Action Bar */}
                <div className="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b dark:border-gray-700 flex flex-wrap gap-2 flex-shrink-0">
                  <Select
                    value={selectedFeedback.status}
                    onValueChange={(value: any) => updateFeedbackStatus(selectedFeedback.id, value)}
                  >
                    <SelectTrigger className="w-full sm:w-[150px] h-9 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                      <SelectItem value="pending" className="dark:text-gray-100 dark:focus:bg-gray-700">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-500" />
                          <span className="text-sm">{t.pending}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="inProgress" className="dark:text-gray-100 dark:focus:bg-gray-700">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-500" />
                          <span className="text-sm">{t.inProgress}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="resolved" className="dark:text-gray-100 dark:focus:bg-gray-700">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
                          <span className="text-sm">{t.resolved}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedFeedback.priority}
                    onValueChange={(value: any) => updateFeedbackPriority(selectedFeedback.id, value)}
                  >
                    <SelectTrigger className="w-full sm:w-[130px] h-9 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                      <SelectItem value="low" className="dark:text-gray-100 dark:focus:bg-gray-700">
                        <span className="text-sm">{ft.low}</span>
                      </SelectItem>
                      <SelectItem value="medium" className="dark:text-gray-100 dark:focus:bg-gray-700">
                        <span className="text-sm">{ft.medium}</span>
                      </SelectItem>
                      <SelectItem value="high" className="dark:text-gray-100 dark:focus:bg-gray-700">
                        <span className="text-sm">{ft.high}</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto px-4 sm:px-6 dark:bg-gray-900/50">
                  <div className="py-4 space-y-5">
                    {/* Original Message */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{ft.originalMessage}</label>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/80 p-3 rounded-lg border dark:border-gray-700">
                        <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                          {selectedFeedback.message}
                        </p>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-600 dark:text-gray-400">{ft.submittedBy}</p>
                          <p className="font-medium truncate dark:text-gray-200">{selectedFeedback.from}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CalendarIcon className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-600 dark:text-gray-400">{t.date}</p>
                          <p className="font-medium text-sm dark:text-gray-200">{new Date(selectedFeedback.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>

                    {/* Comments Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {ft.comments} ({selectedFeedback.comments.length})
                          </label>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {selectedFeedback.comments.length === 0 ? (
                          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed dark:border-gray-700">
                            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">{ft.noComments}</p>
                          </div>
                        ) : (
                          selectedFeedback.comments.map((comment) => (
                            <div key={comment.id} className="flex gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 dark:from-violet-600 dark:to-purple-700 flex items-center justify-center text-white flex-shrink-0">
                                <User className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="bg-gray-50 dark:bg-gray-800/80 rounded-lg p-3 border dark:border-gray-700">
                                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                    <span className="text-xs font-medium dark:text-gray-200">{comment.user}</span>
                                    <Badge variant="secondary" className="text-xs h-4 px-1.5 dark:bg-gray-700 dark:text-gray-300">
                                      {comment.role === 'admin' ? t.admin : t.user}
                                    </Badge>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(comment.timestamp)}</span>
                                  </div>
                                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                                    {comment.message}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comment Input */}
                <div className="border-t dark:border-gray-700 p-4 sm:px-6 bg-white dark:bg-gray-800 flex-shrink-0">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder={ft.writeComment}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[70px] max-h-[120px] resize-none flex-1 text-sm dark:bg-gray-900/50 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          addComment();
                        }
                      }}
                    />
                    <Button
                      onClick={addComment}
                      disabled={!newComment.trim()}
                      className="self-end h-9 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 dark:from-violet-600 dark:to-purple-700 dark:hover:from-violet-700 dark:hover:to-purple-800"
                      size="sm"
                    >
                      <Send className="h-3.5 w-3.5 sm:mr-2" />
                      <span className="hidden sm:inline">{ft.postComment}</span>
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{ft.cmdEnter}</p>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}