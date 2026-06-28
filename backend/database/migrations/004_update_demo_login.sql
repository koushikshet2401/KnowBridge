-- Update the default admin user with demo credentials
UPDATE agents 
SET email = 'knownbridge@test.com', 
    password_hash = '$2a$10$sNozsZY0BQejOXe5B4Mr8OG61zm1Ot2/TGAE.gfhCt2c1Lug1c6pC'
WHERE role = 'admin';
