alter table hospitalization_test_reports drop constraint if exists hospitalization_test_reports_report_type_check;
alter table hospitalization_test_reports add constraint hospitalization_test_reports_report_type_check
  check (report_type in ('blood','ultrasound','xray','pcr','dental','surgical'));
