-- Create the state table to store in-memory cache
CREATE TABLE IF NOT EXISTS state (
  id bigint PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE state ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public reads and updates for the app
CREATE POLICY "Allow public read access" ON state FOR SELECT USING (true);
CREATE POLICY "Allow public update access" ON state FOR UPDATE USING (true);
CREATE POLICY "Allow public insert access" ON state FOR INSERT WITH CHECK (true);
