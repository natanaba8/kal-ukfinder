import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator, Spinner, Switch } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, type SourceDraft } from '@/lib/api';
import type { DetectResult, Method, PreviewResult, Selectors } from '@/lib/types';
import { cn } from '@/lib/utils';

const STEPS = ['Website', 'Content', 'Method', 'Configure', 'Test', 'Preview', 'Activate'] as const;

const SELECTOR_FIELDS: { key: keyof Selectors; label: string; placeholder: string; hint?: string }[] = [
  { key: 'item', label: 'List selector', placeholder: '.job-card', hint: 'The repeating element for one entry' },
  { key: 'title', label: 'Title', placeholder: '.job-title' },
  { key: 'url', label: 'Link', placeholder: 'a@href', hint: 'Add @href to read an attribute' },
  { key: 'organization', label: 'Organisation', placeholder: '.company-name' },
  { key: 'location', label: 'Location', placeholder: '.location' },
  { key: 'deadline', label: 'Deadline', placeholder: '.deadline' },
  { key: 'date', label: 'Published date', placeholder: 'time@datetime' },
  { key: 'description', label: 'Summary', placeholder: '.summary' },
  { key: 'image', label: 'Image', placeholder: 'img@src' },
  { key: 'salary', label: 'Salary', placeholder: '.salary' },
];

/**
 * The guided add-a-source flow from pr.md §32.
 *
 * The point is that a non-technical administrator can paste a URL and end up
 * with a working, tested source — detection fills the form in, and nothing is
 * saved until they have seen real extracted content.
 */
export function SourceWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [draft, setDraft] = useState<SourceDraft>({
    name: '',
    baseUrl: '',
    contentType: 'POLICY',
    method: 'AUTO',
    trust: 'trusted',
    moderation: 'AUTO_PUBLISH',
    scrapeIntervalMinutes: 30,
    maxItemsPerRun: 15,
    active: true,
    selectors: {},
  });

  const [detection, setDetection] = useState<DetectResult | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const update = (patch: SourceDraft) => setDraft((current) => ({ ...current, ...patch }));

  const detect = useMutation({
    mutationFn: () => api.detectSource(draft.baseUrl ?? ''),
    onSuccess: (result) => {
      setDetection(result);
      if (result.ok && result.method) {
        update({
          method: result.method,
          rssUrl: result.rssUrl ?? null,
          apiUrl: result.apiUrl ?? null,
          scrapeUrl: result.scrapeUrl ?? null,
          selectors: result.selectors ?? draft.selectors,
        });
        toast.success(`Detected: collect this site by ${result.method}`);
        setStep(3);
      } else {
        toast.error(result.reason ?? 'Could not work out how to collect this site');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: () => api.testSource({ draft, limit: 10 }),
    onSuccess: (result) => {
      setPreview(result);
      if (result.ok) {
        toast.success(`Found ${result.itemsFound} item(s)`);
        setStep(5);
      } else {
        toast.error(result.reason ?? 'The test failed');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: () => api.createSource(draft),
    onSuccess: (result) => {
      toast.success(`${result.source.name} saved${result.source.active ? ' and activated' : ''}`);
      navigate(`/sources/${result.source.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canContinue = () => {
    switch (step) {
      case 0:
        return Boolean(draft.name?.trim()) && /^https?:\/\/.+/.test(draft.baseUrl ?? '');
      case 3:
        if (draft.method === 'SCRAPER') return Boolean(draft.selectors?.item);
        if (draft.method === 'RSS') return Boolean(draft.rssUrl || draft.baseUrl);
        if (draft.method === 'API') return Boolean(draft.apiUrl || draft.baseUrl);
        return true;
      case 5:
        return Boolean(preview?.ok);
      default:
        return true;
    }
  };

  return (
    <>
      <PageHeader
        title="Add a source"
        description="Paste a website address and the platform works out how to collect it."
      />

      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => index < step && setStep(index)}
              disabled={index > step}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors',
                index === step && 'bg-primary/10 font-medium text-primary',
                index < step && 'text-muted-foreground hover:bg-muted',
                index > step && 'cursor-default text-muted-foreground/50',
              )}
            >
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full text-[11px] font-semibold',
                  index < step ? 'bg-success/15 text-success' : index === step ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {index < step ? <Check className="size-3" /> : index + 1}
              </span>
              {label}
            </button>
            {index < STEPS.length - 1 ? <ChevronRight className="size-3.5 text-muted-foreground/40" /> : null}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Step {step + 1} — {STEPS[step]}
          </CardTitle>
          <CardDescription>{DESCRIPTIONS[step]}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Source name" hint="How it appears in the app and in this panel">
                <Input
                  value={draft.name ?? ''}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="e.g. Department for Education"
                />
              </Field>
              <Field label="Publisher" hint="Optional — the organisation behind it">
                <Input
                  value={draft.publisher ?? ''}
                  onChange={(event) => update({ publisher: event.target.value })}
                  placeholder="e.g. GOV.UK"
                />
              </Field>
              <Field label="Website address" hint="The listing page or the site's home page" className="sm:col-span-2">
                <Input
                  value={draft.baseUrl ?? ''}
                  onChange={(event) => update({ baseUrl: event.target.value })}
                  placeholder="https://example.gov.uk/jobs"
                />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What does this site publish?">
                <Select
                  value={draft.contentType}
                  onValueChange={(value) => update({ contentType: value as SourceDraft['contentType'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JOB">Jobs</SelectItem>
                    <SelectItem value="POLICY">Policies and articles</SelectItem>
                    <SelectItem value="BOTH">Both — decide per item</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Source type" hint="Official sources appear under Policy in the app">
                <Select value={draft.trust} onValueChange={(value) => update({ trust: value as SourceDraft['trust'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="official">Official — government or regulator</SelectItem>
                    <SelectItem value="trusted">Trusted press</SelectItem>
                    <SelectItem value="community">Community</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <Field label="How should we collect it?">
                <Select value={draft.method} onValueChange={(value) => update({ method: value as Method })}>
                  <SelectTrigger className="sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Detect automatically (recommended)</SelectItem>
                    <SelectItem value="RSS">RSS or Atom feed</SelectItem>
                    <SelectItem value="API">JSON API</SelectItem>
                    <SelectItem value="SCRAPER">Read the page directly</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {draft.method === 'AUTO' ? (
                <>
                  <Button onClick={() => detect.mutate()} disabled={detect.isPending}>
                    {detect.isPending ? <Spinner /> : null}
                    Detect collection method
                  </Button>
                  {detection ? <ChecksList detection={detection} /> : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Continue to configure the {draft.method === 'SCRAPER' ? 'selectors' : 'address'} for this method.
                </p>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              {detection?.warning ? (
                <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p>{detection.warning}</p>
                </div>
              ) : null}

              {draft.method === 'RSS' ? (
                <Field label="Feed address">
                  <Input
                    value={draft.rssUrl ?? ''}
                    onChange={(event) => update({ rssUrl: event.target.value })}
                    placeholder="https://example.gov.uk/feed.xml"
                  />
                </Field>
              ) : null}

              {draft.method === 'API' ? (
                <>
                  <Field label="API address">
                    <Input
                      value={draft.apiUrl ?? ''}
                      onChange={(event) => update({ apiUrl: event.target.value })}
                      placeholder="https://example.gov.uk/api/jobs"
                    />
                  </Field>
                  <p className="text-sm text-muted-foreground">
                    Map the JSON fields below using dot paths, for example <code>results</code> for the list and{' '}
                    <code>employer.name</code> for the organisation.
                  </p>
                  <SelectorGrid draft={draft} update={update} availableFields={detection?.availableFields} />
                </>
              ) : null}

              {draft.method === 'SCRAPER' ? (
                <>
                  <Field label="Page to read">
                    <Input
                      value={draft.scrapeUrl ?? draft.baseUrl ?? ''}
                      onChange={(event) => update({ scrapeUrl: event.target.value })}
                    />
                  </Field>
                  <Separator />
                  <SelectorGrid draft={draft} update={update} />
                </>
              ) : null}

              <Separator />

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Check every" hint="Minutes between collections">
                  <Input
                    type="number"
                    min={5}
                    max={10080}
                    value={draft.scrapeIntervalMinutes ?? 30}
                    onChange={(event) => update({ scrapeIntervalMinutes: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Items per run">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.maxItemsPerRun ?? 15}
                    onChange={(event) => update({ maxItemsPerRun: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Publishing">
                  <Select
                    value={draft.moderation}
                    onValueChange={(value) => update({ moderation: value as SourceDraft['moderation'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO_PUBLISH">Publish automatically</SelectItem>
                      <SelectItem value="REQUIRE_APPROVAL">Hold for approval</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This fetches the real site once and shows what would be collected. Nothing is saved.
              </p>
              <Button onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? <Spinner /> : null}
                Test source
              </Button>
              {preview && !preview.ok ? <TestFailure preview={preview} /> : null}
            </div>
          ) : null}

          {step === 5 && preview?.ok ? <PreviewPanel preview={preview} /> : null}

          {step === 6 ? (
            <div className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Summary label="Name" value={draft.name} />
                <Summary label="Address" value={draft.baseUrl} />
                <Summary label="Content" value={draft.contentType} />
                <Summary label="Method" value={preview?.method ?? draft.method} />
                <Summary label="Interval" value={`Every ${draft.scrapeIntervalMinutes} minutes`} />
                <Summary
                  label="Publishing"
                  value={draft.moderation === 'AUTO_PUBLISH' ? 'Publish automatically' : 'Hold for approval'}
                />
              </dl>

              <Separator />

              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span>
                  <span className="block text-sm font-medium">Activate now</span>
                  <span className="block text-xs text-muted-foreground">
                    The scheduler will pick it up on the next tick.
                  </span>
                </span>
                <Switch checked={draft.active ?? true} onCheckedChange={(next) => update({ active: next })} />
              </label>

              <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">
                {save.isPending ? <Spinner /> : null}
                Save {draft.active ? '& activate' : 'as draft'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          <ChevronLeft />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canContinue()}>
            Continue
            <ChevronRight />
          </Button>
        ) : null}
      </div>
    </>
  );
}

const DESCRIPTIONS = [
  'Name the source and give us its web address.',
  'Tell us what kind of content it publishes.',
  'Let the platform detect the best method, or choose one yourself.',
  'Confirm the address or field mapping, and how often to check.',
  'Fetch the site once and check what comes back.',
  'Look at the actual content that would be collected.',
  'Review and switch it on.',
];

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value || '—'}</dd>
    </div>
  );
}

function SelectorGrid({
  draft,
  update,
  availableFields,
}: {
  draft: SourceDraft;
  update: (patch: SourceDraft) => void;
  availableFields?: string[];
}) {
  return (
    <div className="space-y-3">
      {availableFields && availableFields.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Fields found in the response: {availableFields.map((field) => <code key={field} className="mr-1">{field}</code>)}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {SELECTOR_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint}>
            <Input
              value={draft.selectors?.[field.key] ?? ''}
              onChange={(event) =>
                update({ selectors: { ...draft.selectors, [field.key]: event.target.value || undefined } })
              }
              placeholder={field.placeholder}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

function ChecksList({ detection }: { detection: DetectResult }) {
  return (
    <ul className="space-y-1.5 rounded-lg border p-3 text-sm">
      {detection.checks?.map((check) => (
        <li key={check.label} className="flex items-start gap-2">
          {check.ok ? (
            <Check className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span>
            <span className="font-medium">{check.label}</span>
            <span className="text-muted-foreground"> — {check.detail}</span>
          </span>
        </li>
      ))}
      {!detection.ok && detection.reason ? (
        <li className="flex items-start gap-2 text-destructive">
          <X className="mt-0.5 size-4 shrink-0" />
          {detection.reason}
        </li>
      ) : null}
    </ul>
  );
}

function TestFailure({ preview }: { preview: PreviewResult }) {
  return (
    <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 font-medium text-destructive">
        <X className="size-4" />
        {preview.reason}
      </p>
      <p className="text-sm text-muted-foreground">
        {preview.code === 'ROBOTS_DISALLOWED'
          ? 'This site asks automated clients not to read that path. Look for an official feed or API instead, or use a page the site allows.'
          : preview.code === 'SELECTOR_NO_MATCH'
            ? 'Go back a step and check the list selector against the page structure.'
            : 'Check the address, then try again.'}
      </p>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: PreviewResult }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">
          <Check className="size-3" />
          {preview.itemsFound} item(s) found
        </Badge>
        <Badge variant="secondary">{preview.method}</Badge>
        {preview.jobs ? <Badge variant="outline">{preview.jobs} job(s)</Badge> : null}
        {preview.policies ? <Badge variant="outline">{preview.policies} article(s)</Badge> : null}
        {preview.durationMs ? <Badge variant="muted">{preview.durationMs}ms</Badge> : null}
      </div>

      {preview.fieldCoverage ? (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Field coverage</p>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {Object.entries(preview.fieldCoverage).map(([field, count]) => (
              <li key={field} className="flex items-center justify-between gap-2">
                <span className="capitalize text-muted-foreground">{field}</span>
                <span className="tabular font-medium">
                  {count}/{preview.sampleSize}
                  {count === preview.sampleSize ? (
                    <Check className="ml-1 inline size-3.5 text-success" />
                  ) : count === 0 ? (
                    <X className="ml-1 inline size-3.5 text-muted-foreground" />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What would be collected
        </p>
        {preview.preview?.map((item, index) => (
          <div key={`${item.url}-${index}`} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{item.title}</p>
              <Badge variant={item.type === 'job' ? 'default' : 'secondary'}>{item.type}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.url}</p>
            {item.company || item.location ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {[item.company, item.location].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            {item.rawSummary || item.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.rawSummary ?? item.description}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
