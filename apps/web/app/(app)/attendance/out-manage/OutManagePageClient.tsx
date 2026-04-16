'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { OutManageTable } from '@/components/attendance/OutManageTable';
import { OutManageForm } from '@/components/attendance/OutManageForm';
import { TimeDetailSheet } from '@/components/attendance/TimeDetailSheet';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/PageHeader';
import { Plus } from 'lucide-react';
import type { OutManageRecord } from '@/lib/queries/attendance';

interface OutManagePageClientProps {
  initialRecords: OutManageRecord[];
  isManager: boolean;
}

export function OutManagePageClient({ initialRecords, isManager }: OutManagePageClientProps) {
  const t = useTranslations('OutManage');
  const [selectedRecord, setSelectedRecord] = React.useState<OutManageRecord | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  function handleViewDetails(record: OutManageRecord) {
    setSelectedRecord(record);
    setSheetOpen(true);
  }

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-8">
      <PageHeader
        eyebrow="Attendance · Out-manage"
        title={t('title')}
        description={t('description')}
        meta={
          <OutManageForm>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Request
            </Button>
          </OutManageForm>
        }
      />

      <OutManageTable
        records={initialRecords}
        isManager={isManager}
        onViewDetails={handleViewDetails}
      />

      <TimeDetailSheet
        record={selectedRecord}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
