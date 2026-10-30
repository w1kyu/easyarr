import { CircleHelp } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DialogCloseButton } from '@/components/ui/dialog-close-button';
import { Loading } from '@/components/ui/loading';
import { cn } from '@/lib/utils';

// The Markdown renderer is only loaded when someone opens help.
const DocView = lazy(() => import('./doc-view'));

/** "What's this?" link that opens a docs page in a dialog, without leaving the wizard. */
export function WhatsThis({
  slug,
  label,
  className,
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(slug);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCurrent(slug);
          setOpen(true);
        }}
        className={cn(
          'inline-flex items-center gap-1 rounded-full text-13 text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:ring-3 focus-visible:ring-white/20 focus-visible:outline-hidden',
          className,
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden />
        {label ?? t('docs.whatsThis')}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-40px)] overflow-y-auto sm:max-w-[640px]">
          <DialogTitle className="sr-only">{t('docs.title')}</DialogTitle>
          <DialogCloseButton className="absolute top-3 right-3 z-10" />
          <Suspense fallback={<Loading />}>
            <DocView slug={current} onNavigate={setCurrent} />
          </Suspense>
        </DialogContent>
      </Dialog>
    </>
  );
}
