import assert from 'assert';
import { SafetyService } from './modules/safety/safety.service.js';
import { LanguageService } from './modules/language/language.service.js';
import { ComplianceTools } from './modules/compliance/compliance.tools.js';

console.log('🧪 Starting SurakshaMCP service unit tests...\n');

// 1. Test LanguageService
try {
  console.log('Testing LanguageService...');
  const langService = new LanguageService();
  
  assert.strictEqual(langService.isSupported('hi'), true, 'Hindi should be supported');
  assert.strictEqual(langService.isSupported('ta'), true, 'Tamil should be supported');
  assert.strictEqual(langService.isSupported('fr'), false, 'French should not be supported');
  
  assert.strictEqual(langService.name('te'), 'Telugu', 'te should map to Telugu');
  assert.strictEqual(langService.name('ur'), 'Urdu', 'ur should map to Urdu');
  
  const hiHardhat = langService.cannedPhrase('NO-Hardhat', 'hi');
  assert.ok(hiHardhat && hiHardhat.includes('हेलमेट'), 'Hindi hardhat phrase should contain Devanagari characters');
  
  console.log('✅ LanguageService tests passed.');
} catch (e) {
  console.error('❌ LanguageService tests failed:', e);
  process.exit(1);
}

// 2. Test SafetyService
try {
  console.log('\nTesting SafetyService...');
  const safetyService = new SafetyService();
  
  // Test PPE Detections Interpretation
  const mockResult = {
    detections: [
      { class: 'Person', confidence: 0.9, bbox: [10, 10, 50, 100] as [number, number, number, number] },
      { class: 'NO-Hardhat', confidence: 0.85, bbox: [10, 5, 20, 20] as [number, number, number, number] },
    ],
    violations: [],
    compliant: false,
    imageWidth: 640,
    imageHeight: 640,
  };
  
  const interpreted = safetyService.interpret(mockResult);
  assert.strictEqual(interpreted.violations.length, 1, 'Should find 1 violation');
  assert.strictEqual(interpreted.violations[0].type, 'NO-Hardhat', 'Violation should be NO-Hardhat');
  assert.strictEqual(interpreted.violations[0].severity, 'critical', 'NO-Hardhat should be critical');
  assert.ok(interpreted.summary.includes('NO-Hardhat'), 'Summary should mention NO-Hardhat');

  // Test Compliant Detections
  const mockCompliant = {
    detections: [
      { class: 'Person', confidence: 0.95, bbox: [10, 10, 50, 100] as [number, number, number, number] },
      { class: 'Hardhat', confidence: 0.88, bbox: [10, 5, 20, 20] as [number, number, number, number] },
    ],
    violations: [],
    compliant: true,
    imageWidth: 640,
    imageHeight: 640,
  };
  const interpretedCompliant = safetyService.interpret(mockCompliant);
  assert.strictEqual(interpretedCompliant.violations.length, 0, 'Should find 0 violations');
  assert.ok(interpretedCompliant.summary.includes('No PPE violations'), 'Summary should state no violations');

  // Test Proximity Hazards (Struck-by risk)
  // Person box at [10, 10, 50, 50], Machinery box close at [65, 10, 50, 50] -> proximity risk
  const mockProximity = {
    detections: [
      { class: 'Person', confidence: 0.9, bbox: [10, 10, 50, 50] as [number, number, number, number] },
      { class: 'machinery', confidence: 0.8, bbox: [65, 10, 50, 50] as [number, number, number, number] },
    ],
    violations: [],
    compliant: false,
    imageWidth: 1000,
    imageHeight: 1000,
  };
  const hazards = safetyService.proximityHazards(mockProximity);
  assert.strictEqual(hazards.length, 1, 'Should detect 1 proximity hazard');
  assert.ok(hazards[0].type.includes('Proximity'), 'Hazard type should state Proximity');
  assert.strictEqual(hazards[0].severity, 'high', 'Gap is small but not overlapping -> high severity');

  console.log('✅ SafetyService tests passed.');
} catch (e) {
  console.error('❌ SafetyService tests failed:', e);
  process.exit(1);
}

// 3. Test ComplianceTools Safety Report
try {
  console.log('\nTesting ComplianceTools...');
  const complianceTools = new ComplianceTools();
  
  const report = await complianceTools.generateSafetyReport(
    {
      siteId: 'SITE-45',
      violations: [
        { type: 'NO-Hardhat', severity: 'critical', confidence: 0.88 },
        { type: 'NO-Mask', severity: 'medium', confidence: 0.76 }
      ],
      workersObserved: 10
    },
    // Mock context
    { logger: { info() {} } } as any
  );
  
  assert.strictEqual(report.siteId, 'SITE-45', 'Site ID should match');
  assert.strictEqual(report.totalViolations, 2, 'Total violations should be 2');
  assert.strictEqual(report.criticalViolations, 1, 'Critical violations should be 1');
  assert.strictEqual(report.complianceRatePct, 80, 'Compliance rate should be 80%');
  assert.strictEqual(report.breakdown[0].citation.includes('BOCW'), true, 'NO-Hardhat should cite BOCW');
  
  console.log('✅ ComplianceTools tests passed.');
} catch (e) {
  console.error('❌ ComplianceTools tests failed:', e);
  process.exit(1);
}

console.log('\n🎉 All SurakshaMCP unit tests passed successfully!');
