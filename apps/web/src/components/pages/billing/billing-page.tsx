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

type Tab = 'fee' | 'expense' | 'invoice' | 'lifecycle' | 'payment' | 'credit' | 'ledger' | 'balance' | 'tax';

export function BillingPage(): React.ReactNode {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('invoice');

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
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'fee' && <FeeSection />}
        {activeTab === 'expense' && <ExpenseSection />}
        {activeTab === 'invoice' && <InvoiceSection />}
        {activeTab === 'lifecycle' && <InvoiceLifecycleSection />}
        {activeTab === 'payment' && <PaymentSection />}
        {activeTab === 'credit' && <CreditSection />}
        {activeTab === 'ledger' && <LedgerSection />}
        {activeTab === 'balance' && <BalanceSection />}
        {activeTab === 'tax' && <TaxSection />}
      </div>
    </section>
  );
}
