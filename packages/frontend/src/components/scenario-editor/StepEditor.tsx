import React, { useState } from 'react';
import { TestStep } from '../../types/scenario';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { TrashIcon, Bars3Icon } from '@heroicons/react/24/outline';

interface StepEditorProps {
  step: TestStep;
  onChange: (step: TestStep) => void;
  onDelete: () => void;
  isDragging?: boolean;
}

const STEP_TYPES = [
  { value: 'navigate', label: 'Navigate' },
  { value: 'click', label: 'Click' },
  { value: 'type', label: 'Type' },
  { value: 'wait', label: 'Wait' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'custom', label: 'Custom' }
];

export const StepEditor: React.FC<StepEditorProps> = ({
  step,
  onChange,
  onDelete,
  isDragging = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFieldChange = (field: keyof TestStep, value: any) => {
    onChange({
      ...step,
      [field]: value
    });
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'navigate': return '🧭';
      case 'click': return '👆';
      case 'type': return '⌨️';
      case 'wait': return '⏱️';
      case 'screenshot': return '📸';
      default: return '⚙️';
    }
  };

  const shouldShowSelector = () => {
    return ['click', 'type', 'wait'].includes(step.type);
  };

  const shouldShowValue = () => {
    return ['type', 'navigate'].includes(step.type);
  };

  const shouldShowTimeout = () => {
    return ['wait', 'click', 'type'].includes(step.type);
  };

  return (
    <div className={`step-editor bg-white border rounded-lg p-4 transition-all duration-200 ${
      isDragging ? 'shadow-lg border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <Bars3Icon className="w-5 h-5 text-gray-400 cursor-grab" />
          <span className="text-lg">{getStepIcon(step.type)}</span>
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">
              {step.description || `${step.type} step`}
            </h4>
            <p className="text-sm text-gray-500">
              {step.type} {step.selector && `• ${step.selector}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-4 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step Type */}
            <Select
              label="Step Type"
              value={step.type}
              onChange={(value) => handleFieldChange('type', value)}
              options={STEP_TYPES}
            />

            {/* Description */}
            <Input
              label="Description"
              value={step.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Describe what this step does"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Selector */}
            {shouldShowSelector() && (
              <Input
                label="Selector"
                value={step.selector || ''}
                onChange={(e) => handleFieldChange('selector', e.target.value)}
                placeholder="CSS selector or XPath"
                helperText="Use data-testid, CSS selectors, or XPath"
              />
            )}

            {/* Value */}
            {shouldShowValue() && (
              <Input
                label={step.type === 'navigate' ? 'URL' : 'Text to Type'}
                value={step.value || ''}
                onChange={(e) => handleFieldChange('value', e.target.value)}
                placeholder={step.type === 'navigate' ? 'https://example.com' : 'Text to enter'}
              />
            )}

            {/* Timeout */}
            {shouldShowTimeout() && (
              <Input
                label="Timeout (ms)"
                type="number"
                value={step.timeout || 5000}
                onChange={(e) => handleFieldChange('timeout', parseInt(e.target.value) || 5000)}
                placeholder="5000"
                helperText="Maximum time to wait for action"
              />
            )}
          </div>

          {/* Step-specific options */}
          {step.type === 'wait' && (
            <div className="bg-gray-50 p-3 rounded-md">
              <p className="text-sm text-gray-600 mb-2">Wait Options:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('selector', 'networkidle')}
                  className={step.selector === 'networkidle' ? 'bg-blue-100' : ''}
                >
                  Network Idle
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('selector', 'domcontentloaded')}
                  className={step.selector === 'domcontentloaded' ? 'bg-blue-100' : ''}
                >
                  DOM Loaded
                </Button>
              </div>
            </div>
          )}

          {step.type === 'click' && (
            <div className="bg-gray-50 p-3 rounded-md">
              <p className="text-sm text-gray-600 mb-2">Click Options:</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('value', 'left')}
                  className={step.value === 'left' ? 'bg-blue-100' : ''}
                >
                  Left Click
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('value', 'right')}
                  className={step.value === 'right' ? 'bg-blue-100' : ''}
                >
                  Right Click
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('value', 'double')}
                  className={step.value === 'double' ? 'bg-blue-100' : ''}
                >
                  Double Click
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};