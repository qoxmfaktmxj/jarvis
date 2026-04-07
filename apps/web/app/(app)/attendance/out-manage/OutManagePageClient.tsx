'use client';

import * as React from 'react';
import { OutManageTable } from '@/components/attendance/OutManageTable';
import { OutManageForm } from '@/components/attendance/OutManageForm';
import { TimeDetailSheet } from '@/components/attendance/TimeDetailSheet';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { OutManageRecord } from '@/lib/queries/attendance';

interface OutManagePageClientProps {
  initialRecords: OutManageRecord[];
  isManager: boolean;
}

export function OutManagePageClient({ initialRecords, isManager }: OutManagePageClientProps) {
  const [selectedRecord, setSelectedRecord] = React.useState<OutManageRecord | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  function handleViewDetails(record: OutManageRecord) {
    setSelectedRecord(record);
    setSheetOpen(true);
  }

  return (
    <div className="container mx-auto max-w-5xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Out-of-Office</h1>
          <p className="text-sm text-gray-500">Manage out-of-office requests and approvals.</p>
        </div>
        <OutManageForm>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Request
          </Button>
        </OutManageForm>
      </div>

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
