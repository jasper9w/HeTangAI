

def read_lines(filename):
    with open(filename) as f:
        lines = f.readlines()
        liens = [line.rstrip('\n') for line in lines if line.strip()]
        return liens

def read_text(filename):
    with open(filename) as f:
        return f.read()

if __name__ == "__main__":
    lines = read_lines("novel.txt")
    for line in lines:
        print(line.strip())