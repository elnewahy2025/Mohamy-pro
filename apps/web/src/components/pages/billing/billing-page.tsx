'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FeeSection } from '@/components/pages/billing/fee-section';
import { ExpenseSection } from '@/components/pages/billing/expense-section';
import { InvoiceSection } from '@/components/pages/billing/invoice-section';
import { InvoiceLifecycleSection } from '@/components/pages/billing/invoice-lifecycle-section';
import { PaymentSection } from '@/components/pages/billing/payment-section';
import { CreditSection } from '@/components/pages/billing/credit-section';
import { LedgerSection } from '@/components/pages/billing/ledger-section';
import { BalanceSection } from '@/components/pages/billing/balance-section';
import { TaxSection } from '@/components/pages/billing/tax-section';
import { Button } from '@/components/ui/button';

type Tab =
  | 'fee'
  | 'expense'
  | 'invoice'
  | 'lifecycle'
  | 'payment'
  | 'credit'
  | 'ledger'
  | 'balance'
  | 'tax';

export function BillingPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('invoice');

  // Track which tabs have been visited so we can lazily mount them and keep them alive
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({
    invoice: true,
  });

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (!mountedTabs[tab]) {
      setMountedTabs((prev) => ({ ...prev, [tab]: true }));
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'fee', label: t('billing.sections.fee.heading') },
    { key: 'expense', label: t('billing.sections.expense.heading') },
    { key: 'invoice', label: t('billing.sections.invoice.heading') },
    { key: 'lifecycle', label: t('billing.sections.lifecycle.heading') },
    { key: 'payment', label: t('billing.sections.payment.heading') },
    { key: 'credit', label: t('billing.sections.credit.heading') },
    { key: 'ledger', label: t('billing.sections.ledger.heading') },
    { key: 'balance', label: t('billing.sections.balance.heading') },
    { key: 'tax', label: t('billing.sections.tax.heading') },
  ];

  return (
    <section className="page-section content-page">
      <div className="page-heading">
        <p className="eyebrow">{t('billing.eyebrow')}</p>
        <h1>{t('billing.title')}</h1>
        <p>{t('billing.description')}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'default' : 'ghost'}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="tab-content">
        <div className={activeTab === 'fee' ? 'block' : 'hidden'}>
          {mountedTabs.fee && <FeeSection />}
        </div>
        <div className={activeTab === 'expense' ? 'block' : 'hidden'}>
          {mountedTabs.expense && <ExpenseSection />}
        </div>
        <div className={activeTab === 'invoice' ? 'block' : 'hidden'}>
          {mountedTabs.invoice && <InvoiceSection />}
        </div>
        <div className={activeTab === 'lifecycle' ? 'block' : 'hidden'}>
          {mountedTabs.lifecycle && <InvoiceLifecycleSection />}
        </div>
        <div className={activeTab === 'payment' ? 'block' : 'hidden'}>
          {mountedTabs.payment && <PaymentSection />}
        </div>
        <div className={activeTab === 'credit' ? 'block' : 'hidden'}>
          {mountedTabs.credit && <CreditSection />}
        </div>
        <div className={activeTab === 'ledger' ? 'block' : 'hidden'}>
          {mountedTabs.ledger && <LedgerSection />}
        </div>
        <div className={activeTab === 'balance' ? 'block' : 'hidden'}>
          {mountedTabs.balance && <BalanceSection />}
        </div>
        <div className={activeTab === 'tax' ? 'block' : 'hidden'}>
          {mountedTabs.tax && <TaxSection />}
        </div>
      </div>
    </section>
  );
}
