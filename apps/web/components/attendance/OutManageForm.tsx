'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const timeDetailSchema = z.object({
  timeFrom: z.string().min(1, 'Required'),
  timeTo: z.string().min(1, 'Required'),
  activity: z.string().max(500).optional(),
});

const formSchema = z.object({
  outDate: z.string().date('Must be a valid date (YYYY-MM-DD)'),
  outType: z.enum(['client-visit', 'errand', 'remote', 'training', 'other']),
  destination: z.string().max(500).optional(),
  purpose: z.string().min(1, 'Purpose is required').max(2000),
  companyId: z.string().uuid('Must be a valid UUID').optional().or(z.literal('')),
  details: z
    .array(timeDetailSchema)
    .min(1, 'At least one time block is required'),
});

type FormValues = z.infer<typeof formSchema>;

const OUT_TYPE_LABELS: Record<string, string> = {
  'client-visit': 'Client Visit',
  errand:         'Errand',
  remote:         'Remote Work',
  training:       'Training',
  other:          'Other',
};

interface OutManageFormProps {
  children: React.ReactNode; // trigger element
}

export function OutManageForm({ children }: OutManageFormProps) {
  const t = useTranslations('OutManage');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const today = new Date().toISOString().split('T')[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      outDate: today,
      outType: 'errand',
      destination: '',
      purpose: '',
      companyId: '',
      details: [{ timeFrom: '', timeTo: '', activity: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'details',
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      // Convert local datetime-local inputs (YYYY-MM-DDTHH:mm) to ISO strings
      const payload = {
        ...values,
        companyId: values.companyId || undefined,
        details: values.details.map((d) => ({
          timeFrom: new Date(d.timeFrom).toISOString(),
          timeTo: new Date(d.timeTo).toISOString(),
          activity: d.activity || undefined,
        })),
      };
      const res = await fetch('/api/attendance/out-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        form.setError('root', { message: err.error?.formErrors?.[0] ?? 'Submission failed' });
        return;
      }
      setOpen(false);
      form.reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {React.cloneElement(children as React.ReactElement<{ onClick: () => void }>, {
        onClick: () => setOpen(true),
      })}
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('newRequest')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="outDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('date')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="outType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('type')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(OUT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="destination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination <span className="text-surface-400 text-xs">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Client HQ, City Hall" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('purpose')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Describe the purpose of this out-of-office..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Time blocks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Time Blocks</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ timeFrom: '', timeTo: '', activity: '' })}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Block
                </Button>
              </div>
              {fields.map((f, i) => (
                <div key={f.id} className="rounded-md border p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`details.${i}.timeFrom`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">From</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`details.${i}.timeTo`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">To</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <FormField
                      control={form.control}
                      name={`details.${i}.activity`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel className="text-xs">Activity <span className="text-surface-400">(optional)</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Contract negotiation" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mb-0.5 text-red-500 hover:text-red-600"
                        onClick={() => remove(i)}
                        aria-label="Remove time block"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {form.formState.errors.details?.root && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.details.root.message}
                </p>
              )}
            </div>

            {form.formState.errors.root && (
              <p className="text-sm text-red-600">{form.formState.errors.root.message}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    </>
  );
}
