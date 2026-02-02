import React, { useState } from 'react';
import { TestAssertion } from '../../types/scenario';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { TrashIcon, Bars3Icon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface AssertionEditorProps {
  assertion: TestAssertion;
  onChange: (assertion: TestAssertion) => void;
  onDelete: () => void;
  isDragging?: boolean;
}

const ASSERTION_TYPES = [
  { value: 'visible', label: 'Element Visible' },
  { value: 'text', label: 'Text Content' },
  { value: 'attribute', label: 'Attribute Value' },
  { value: 'count', label: 'Element Count' },
  { value: 'url', label: 'URL Match' },
  { value: 'custom', label: 'Custom' }
];

export const AssertionEditor: React.FC<AssertionEditorProps> = ({
  assertion,
  onChange,
  onDelete,
  isDragging = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFieldChange = (field: keyof TestAssertion, value: any) => {
    onChange({
      ...assertion,
      [field]: value
    });
  };

  const getAssertionIcon = (type: string) => {
    switch (type) {
      case 'visible': return '👁️';
      case 'text': return '📝';
      case 'attribute': return '🏷️';
      case 'count': return '🔢';
      case 'url': return '🔗';
      default: return '✅';
    }
  };

  const shouldShowSelector = () => {
    return ['visible', 'text', 'attribute', 'count'].includes(assertion.type);
  };

  const getExpectedPlaceholder = () => {
    switch (assertion.type) {
      case 'visible': return 'true/false';
      case 'text': return 'Expected text content';
      case 'attribute': return 'Expected attribute value';
      case 'count': return 'Expected number of elements';
      case 'url': return 'Expected URL pattern';
      default: return 'Expected value';
    }
  };

  const getAssertionPreview = () => {
    const { type, selector, expected } = assertion;
    
    switch (type) {
      case 'visible':
        return `Expect element "${selector}" to be ${expected === 'true' ? 'visible' : 'hidden'}`;
      case 'text':
        return `Expect element "${selector}" to contain text "${expected}"`;
      case 'attribute':
        return `Expect element "${selector}" attribute to equal "${expected}"`;
      case 'count':
        return `Expect ${expected} elements matching "${selector}"`;
      case 'url':
        return `Expect URL to match pattern "${expected}"`;
      default:
        return assertion.description || 'Custom assertion';
    }
  };

  return (
    <div className={`assertion-editor bg-white border rounded-lg p-4 transition-all duration-200 ${
      isDragging ? 'shadow-lg border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <Bars3Icon className="w-5 h-5 text-gray-400 cursor-grab" />
          <CheckCircleIcon className="w-5 h-5 text-green-600" />
          <span className="text-lg">{getAssertionIcon(assertion.type)}</span>
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">
              {assertion.description || `${assertion.type} assertion`}
            </h4>
            <p className="text-sm text-gray-500">
              {getAssertionPreview()}
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
            {/* Assertion Type */}
            <Select
              label="Assertion Type"
              value={assertion.type}
              onChange={(value) => handleFieldChange('type', value)}
              options={ASSERTION_TYPES}
            />

            {/* Description */}
            <Input
              label="Description"
              value={assertion.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Describe what this assertion verifies"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Selector */}
            {shouldShowSelector() && (
              <Input
                label="Selector"
                value={assertion.selector || ''}
                onChange={(e) => handleFieldChange('selector', e.target.value)}
                placeholder="CSS selector or XPath"
                helperText="Element to check"
              />
            )}

            {/* Expected Value */}
            <Input
              label="Expected Value"
              value={assertion.expected}
              onChange={(e) => handleFieldChange('expected', e.target.value)}
              placeholder={getExpectedPlaceholder()}
              helperText="What value to expect"
            />
          </div>

          {/* Type-specific options */}
          {assertion.type === 'visible' && (
            <div className="bg-gray-50 p-3 rounded-md">
              <p className="text-sm text-gray-600 mb-2">Visibility Options:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('expected', 'true')}
                  className={assertion.expected === 'true' ? 'bg-green-100' : ''}
                >
                  Should be Visible
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('expected', 'false')}
                  className={assertion.expected === 'false' ? 'bg-red-100' : ''}
                >
                  Should be Hidden
                </Button>
              </div>
            </div>
          )}

          {assertion.type === 'text' && (
            <div className="bg-gray-50 p-3 rounded-md">
              <p className="text-sm text-gray-600 mb-2">Text Matching Options:</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('matchType', 'exact')}
                  className={assertion.matchType === 'exact' ? 'bg-blue-100' : ''}
                >
                  Exact Match
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('matchType', 'contains')}
                  className={assertion.matchType === 'contains' ? 'bg-blue-100' : ''}
                >
                  Contains
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('matchType', 'regex')}
                  className={assertion.matchType === 'regex' ? 'bg-blue-100' : ''}
                >
                  Regex
                </Button>
              </div>
            </div>
          )}

          {assertion.type === 'attribute' && (
            <div className="bg-gray-50 p-3 rounded-md">
              <Input
                label="Attribute Name"
                value={assertion.attributeName || ''}
                onChange={(e) => handleFieldChange('attributeName', e.target.value)}
                placeholder="class, id, data-testid, etc."
              />
            </div>
          )}

          {assertion.type === 'count' && (
            <div className="bg-gray-50 p-3 rounded-md">
              <p className="text-sm text-gray-600 mb-2">Count Comparison:</p>
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('operator', 'equals')}
                  className={assertion.operator === 'equals' ? 'bg-blue-100' : ''}
                >
                  Equals
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('operator', 'greater')}
                  className={assertion.operator === 'greater' ? 'bg-blue-100' : ''}
                >
                  Greater
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('operator', 'less')}
                  className={assertion.operator === 'less' ? 'bg-blue-100' : ''}
                >
                  Less
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFieldChange('operator', 'between')}
                  className={assertion.operator === 'between' ? 'bg-blue-100' : ''}
                >
                  Between
                </Button>
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm font-medium text-blue-900 mb-1">Assertion Preview:</p>
            <code className="text-sm text-blue-800 bg-blue-100 px-2 py-1 rounded">
              {getAssertionPreview()}
            </code>
          </div>
        </div>
      )}
    </div>
  );
};