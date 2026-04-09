'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UserWithOrg } from '@/lib/queries/admin';

const ROLE_OPTIONS = ['ADMIN', 'MANAGER', 'DEVELOPER', 'HR', 'VIEWER'] as const;

const schema = z.object({
  employeeId: z.string().min(1, 'Required'),
  name:       z.string().min(1, 'Required'),
  email:      z.string().email().optional().or(z.literal('')),
  orgId:      z.string().uuid().optional().or(z.literal('')),
  roleCodes:  z.array(z.enum(ROLE_OPTIONS)).min(1, 'Select at least one role'),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open:           boolean;
  onOpenChange:   (v: boolean) => void;
  defaultValues?: Partial<UserWithOrg>;
  orgOptions:     Array<{ id: string; name: string }>;
  onSuccess:      () => void;
};

export function UserForm({ open, onOpenChange, defaultValues, orgOptions, onSuccess }: Props) {
  const t = useTranslations('Admin.UserForm');
  const isEdit = !!defaultValues?.id;

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        employeeId: defaultValues?.employeeId ?? '',
        name:       defaultValues?.name        ?? '',
        email:      defaultValues?.email        ?? '',
        orgId:      defaultValues?.orgId        ?? '',
        roleCodes:  (defaultValues?.roles as typeof ROLE_OPTIONS[number][]) ?? ['VIEWER'],
      },
    });

  useEffect(() => {
    if (open) {
      reset({
        employeeId: defaultValues?.employeeId ?? '',
        name:       defaultValues?.name        ?? '',
        email:      defaultValues?.email        ?? '',
        orgId:      defaultValues?.orgId        ?? '',
        roleCodes:  (defaultValues?.roles as typeof ROLE_OPTIONS[number][]) ?? ['VIEWER'],
      });
    }
  }, [open, defaultValues, reset]);

  const onSubmit = async (values: FormValues) => {
    const url    = '/api/admin/users';
    const method = isEdit ? 'PUT' : 'POST';
    const body   = isEdit ? { ...values, id: defaultValues!.id } : values;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (res.ok) {
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('addTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="employeeId">{t('employeeId')}</Label>
            <Input id="employeeId" {...register('employeeId')} disabled={isEdit} />
            {errors.employeeId && <p className="text-xs text-destructive">{errors.employeeId.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="name">{t('name')}</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">{t('email')}</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>{t('organization')}</Label>
            <Controller
              name="orgId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectOrg')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('noOrg')}</SelectItem>
                    {orgOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("roles")}</Label>
            <Controller
              name="roleCodes"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-3">
                  {ROLE_OPTIONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.value.includes(r)}
                        onChange={(e) => {
                          field.onChange(
                            e.target.checked
                              ? [...field.value, r]
                              : field.value.filter((v) => v !== r),
                          );
                        }}
                        className="h-4 w-4 rounded border"
                      />
                      <span className="text-sm">{r}</span>
                    </label>
                  ))}
                </div>
              )}
            />
            {errors.roleCodes && <p className="text-xs text-destructive">{errors.roleCodes.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('createUser')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
