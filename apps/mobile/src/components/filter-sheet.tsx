import { Switch, View } from 'react-native';

import { Button, ButtonText, Chip, HStack, Text, VStack } from '@/components/ui/gs';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
  ActionsheetScrollView,
} from '@/components/ui/gs/actionsheet';

export type JobFilters = {
  category?: string;
  location?: string;
  organization?: string;
  employmentType?: string;
  remote: boolean;
  openOnly: boolean;
  salaryMin: number;
};

export const EMPTY_JOB_FILTERS: JobFilters = { remote: false, openOnly: true, salaryMin: 0 };

const SALARY_STEPS = [0, 25000, 35000, 45000, 60000];

const EMPLOYMENT_TYPES = [
  { id: 'full_time', label: 'Full time' },
  { id: 'part_time', label: 'Part time' },
  { id: 'apprenticeship', label: 'Apprenticeship' },
  { id: 'graduate', label: 'Graduate' },
  { id: 'contract', label: 'Contract' },
  { id: 'internship', label: 'Internship' },
];

/**
 * The Jobs filter sheet (pr.md §23), built on the GlueStack UI actionsheet so
 * focus handling, the back button and screen-reader behaviour come from the
 * library rather than being hand-rolled.
 */
export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  options,
}: {
  open: boolean;
  onClose: () => void;
  filters: JobFilters;
  onChange: (next: JobFilters) => void;
  options: {
    categories: { category: string; total: number }[];
    locations: { location: string; total: number }[];
    organizations: { organization: string; total: number }[];
  };
}) {
  const toggle = <K extends keyof JobFilters>(key: K, value: JobFilters[K]) =>
    onChange({ ...filters, [key]: filters[key] === value ? undefined : value } as JobFilters);

  const activeCount = [
    filters.category,
    filters.location,
    filters.organization,
    filters.employmentType,
    filters.remote ? 'remote' : undefined,
    filters.salaryMin ? 'salary' : undefined,
  ].filter(Boolean).length;

  return (
    <Actionsheet isOpen={open} onClose={onClose}>
      <ActionsheetBackdrop />
      <ActionsheetContent>
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>

        <HStack className="w-full items-center justify-between">
          <Text size="md" bold>
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Text>
          <Chip label="Clear all" size="sm" onPress={() => onChange(EMPTY_JOB_FILTERS)} />
        </HStack>

        <ActionsheetScrollView>
          <VStack space="lg" className="pb-4">
            <Group title="Employment type">
              {EMPLOYMENT_TYPES.map((type) => (
                <Chip
                  key={type.id}
                  label={type.label}
                  selected={filters.employmentType === type.id}
                  onPress={() => toggle('employmentType', type.id)}
                />
              ))}
            </Group>

            {options.categories.length > 0 ? (
              <Group title="Category">
                {options.categories.slice(0, 14).map((entry) => (
                  <Chip
                    key={entry.category}
                    label={`${entry.category} (${entry.total})`}
                    selected={filters.category === entry.category}
                    onPress={() => toggle('category', entry.category)}
                  />
                ))}
              </Group>
            ) : null}

            {options.locations.length > 0 ? (
              <Group title="Location">
                {options.locations.slice(0, 14).map((entry) => (
                  <Chip
                    key={entry.location}
                    label={`${entry.location} (${entry.total})`}
                    selected={filters.location === entry.location}
                    onPress={() => toggle('location', entry.location)}
                  />
                ))}
              </Group>
            ) : null}

            {options.organizations.length > 0 ? (
              <Group title="Organisation">
                {options.organizations.slice(0, 12).map((entry) => (
                  <Chip
                    key={entry.organization}
                    label={entry.organization}
                    selected={filters.organization === entry.organization}
                    onPress={() => toggle('organization', entry.organization)}
                  />
                ))}
              </Group>
            ) : null}

            <Group title="Minimum salary">
              {SALARY_STEPS.map((step) => (
                <Chip
                  key={step}
                  label={step === 0 ? 'Any' : `£${step / 1000}k+`}
                  selected={filters.salaryMin === step}
                  onPress={() => onChange({ ...filters, salaryMin: step })}
                />
              ))}
            </Group>

            <VStack space="md">
              <SwitchRow
                label="Remote or hybrid only"
                value={filters.remote}
                onValueChange={(value) => onChange({ ...filters, remote: value })}
              />
              <SwitchRow
                label="Hide closed vacancies"
                description="Leaves out anything past its closing date."
                value={filters.openOnly}
                onValueChange={(value) => onChange({ ...filters, openOnly: value })}
              />
            </VStack>
          </VStack>
        </ActionsheetScrollView>

        <Button className="w-full" onPress={onClose}>
          <ButtonText>Show results</ButtonText>
        </Button>
      </ActionsheetContent>
    </Actionsheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <VStack space="sm">
      <Text size="xs" bold tone="dim">
        {title.toUpperCase()}
      </Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </VStack>
  );
}

function SwitchRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <HStack className="items-center justify-between gap-4">
      <VStack space="xs" className="flex-1">
        <Text>{label}</Text>
        {description ? (
          <Text size="xs" tone="dim">
            {description}
          </Text>
        ) : null}
      </VStack>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: '#1D4E89', false: '#DFE3EA' }} />
    </HStack>
  );
}
