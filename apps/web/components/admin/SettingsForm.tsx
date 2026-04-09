'use client';

import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';

const schema = z.object({
  name: z.string().min(1, 'Required').max(200),
});

type FormValues = z.infer<typeof schema>;

type Workspace = {
  id:   string;
  name: string;
  code: string;
};

type Props = { workspace: Workspace };

export function SettingsForm({ workspace }: Props) {
  const t = useTranslations('Admin.Settings');
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { name: workspace.name },
    });

  const onSubmit = async (values: FormValues) => {
    await fetch('/api/admin/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(values),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-md">
      <div className="space-y-1">
        <Label htmlFor="ws-code">{t('workspaceCode')}</Label>
        <Input id="ws-code" value={workspace.code} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">{t('workspaceCodeNote')}</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ws-name">{t('workspaceName')}</Label>
        <Input id="ws-name" {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
