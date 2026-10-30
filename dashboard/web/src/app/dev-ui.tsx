// Dev-only component showcase (/dev/ui). Strings here are developer-facing samples, not product copy.
import { SERVICES } from '@easyarr/shared';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '~/components/empty-state';
import { GlassPanel } from '~/components/glass-panel';
import { Logo } from '~/components/logo';
import { ServiceIcon } from '~/components/service-icon';
import { StatusPill } from '~/components/status-pill';
import { Stepper } from '~/components/stepper';
import { ErrorAlert, InfoAlert, WarningAlert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyableField } from '@/components/ui/copyable-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input, PasswordInput } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassPanel className="flex flex-col gap-3">
      <h2 className="text-15 font-semibold text-white/70">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </GlassPanel>
  );
}

export default function DevUi() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'torrents' | 'usenet' | 'both'>('torrents');
  const [on, setOn] = useState(true);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-24 font-bold">{t('devui.title')}</h1>
      <Section title="Identity">
        <Logo size={64} />
        {SERVICES.map((s) => (
          <ServiceIcon key={s.id} id={s.id} size={40} />
        ))}
      </Section>
      <Section title="Buttons (vendored)">
        <Button>Default</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button size="lg" variant="primary">
          Large
        </Button>
        <Button disabled>Disabled</Button>
      </Section>
      <Section title="Inputs (vendored)">
        <div className="w-64">
          <Input placeholder="Username" />
        </div>
        <div className="w-64">
          <PasswordInput value="hunter22" onValueChange={() => undefined} />
        </div>
        <Switch checked={on} onCheckedChange={setOn} />
        <Checkbox />
        <RadioGroup defaultValue="a" className="flex gap-3">
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
        </RadioGroup>
        <SegmentedControl
          value={mode}
          onValueChange={setMode}
          tabs={[
            { id: 'torrents', label: 'Torrents' },
            { id: 'usenet', label: 'Usenet' },
            { id: 'both', label: 'Both' },
          ]}
        />
      </Section>
      <Section title="Feedback">
        <StatusPill status="ok" />
        <StatusPill status="warning" />
        <StatusPill status="error" />
        <StatusPill status="idle" />
        <Badge>Badge</Badge>
        <Badge variant="primary">Primary</Badge>
        <div className="w-64">
          <Progress value={42} />
        </div>
        <Loading />
        <Stepper current={3} total={9} />
        <div className="w-full max-w-xl space-y-2">
          <InfoAlert description="Info alert" />
          <WarningAlert description="Warning alert" />
          <ErrorAlert description="Error alert" />
        </div>
      </Section>
      <Section title="Overlays (vendored)">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>Dialogs look like umbrelOS settings.</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Alert dialog</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>This is a confirmation.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>Confirm</AlertDialogAction>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button onClick={() => toast.success('Saved')}>Toast</Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Tooltip</Button>
          </TooltipTrigger>
          <TooltipContent>Hello</TooltipContent>
        </Tooltip>
      </Section>
      <Section title="Tabs + copyable field">
        <Tabs defaultValue="one" className="w-full max-w-md">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">
            <CopyableField value="http://umbrel.local:39096" />
          </TabsContent>
          <TabsContent value="two">Second tab</TabsContent>
        </Tabs>
      </Section>
      <GlassPanel>
        <EmptyState icon={Inbox} title={t('empty.title')}>
          Empty states use this layout.
        </EmptyState>
      </GlassPanel>
    </div>
  );
}
