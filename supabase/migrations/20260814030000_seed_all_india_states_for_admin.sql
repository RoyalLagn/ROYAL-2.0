begin;

-- Admin hierarchy selectors must show the complete India State/UT list.
-- New rows remain inactive so public and vendor discovery are unchanged.
-- Districts and Talukas continue to come from the canonical imported data.
insert into public.geo_states (name, code, country, is_active)
values
  ('Andaman and Nicobar Islands', 'AN', 'India', false),
  ('Andhra Pradesh', 'AP', 'India', false),
  ('Arunachal Pradesh', 'AR', 'India', false),
  ('Assam', 'AS', 'India', false),
  ('Bihar', 'BR', 'India', false),
  ('Chandigarh', 'CH', 'India', false),
  ('Chhattisgarh', 'CG', 'India', false),
  ('Dadra and Nagar Haveli and Daman and Diu', 'DH', 'India', false),
  ('Delhi', 'DL', 'India', false),
  ('Goa', 'GA', 'India', false),
  ('Gujarat', 'GJ', 'India', false),
  ('Haryana', 'HR', 'India', false),
  ('Himachal Pradesh', 'HP', 'India', false),
  ('Jammu and Kashmir', 'JK', 'India', false),
  ('Jharkhand', 'JH', 'India', false),
  ('Karnataka', 'KA', 'India', false),
  ('Kerala', 'KL', 'India', false),
  ('Ladakh', 'LA', 'India', false),
  ('Lakshadweep', 'LD', 'India', false),
  ('Madhya Pradesh', 'MP', 'India', false),
  ('Maharashtra', 'MH', 'India', false),
  ('Manipur', 'MN', 'India', false),
  ('Meghalaya', 'ML', 'India', false),
  ('Mizoram', 'MZ', 'India', false),
  ('Nagaland', 'NL', 'India', false),
  ('Odisha', 'OD', 'India', false),
  ('Puducherry', 'PY', 'India', false),
  ('Punjab', 'PB', 'India', false),
  ('Rajasthan', 'RJ', 'India', false),
  ('Sikkim', 'SK', 'India', false),
  ('Tamil Nadu', 'TN', 'India', false),
  ('Telangana', 'TS', 'India', false),
  ('Tripura', 'TR', 'India', false),
  ('Uttar Pradesh', 'UP', 'India', false),
  ('Uttarakhand', 'UK', 'India', false),
  ('West Bengal', 'WB', 'India', false)
on conflict (lower(name)) do update
set code = excluded.code;

commit;
