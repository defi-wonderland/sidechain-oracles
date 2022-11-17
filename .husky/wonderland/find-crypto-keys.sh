#!/bin/bash
RESTORE='\033[0m'
RED='\033[00;31m'
YELLOW='\033[00;33m'
BLUE='\033[00;34m'

FOUND=""

# Check HEAD
if git rev-parse --verify HEAD > /dev/null 2>&1
then
	AGAINST=HEAD
else
    empty_tree=$( git hash-object -t tree /dev/null )
	AGAINST="$empty_tree"
fi

# Get a list of files in the index excluding deleted files
FILE_LIST=$(git diff --cached --name-only --diff-filter=d ${AGAINST})
SHOW_FIRST=5
SHOW_LAST=10
ASTERISKS_LENGTH=$(expr 64 - ${SHOW_FIRST} - ${SHOW_LAST})
ASTERISKS=$(printf "*%.0s" $(seq $ASTERISKS_LENGTH))

# For each file with changes
for FILE in $FILE_LIST
do
    if [ ! -z $(git diff --cached --unified=0 $FILE | grep '^+' | grep -E -o '[1234567890abcdefABCDEF]{64}') ]; then
        QUERY=`git diff --cached $FILE | grep '^+' | grep -E -o '[1234567890abcdefABCDEF]{64}' | sed -r "s/(.{${SHOW_FIRST}})(.*)(.{${SHOW_LAST}})/\1$ASTERISKS\3/"`
        FOUND="${FOUND} ${BLUE}${FILE}:${RED}${QUERY}${RESTORE}\n"
    fi
done

# if FOUND is not empty, REJECT the COMMIT

if [ ! -z "$FOUND" ]; then
    printf "${RED}COMMIT REJECTED: ${RESTORE}"
    printf "${YELLOW}Possible private key${RESTORE}\n"
    printf "Please check the next files, if they are ok, commit with ${YELLOW}--no-verify${RESTORE}\n"
    printf "$FOUND"
    exit 1
fi
exit 0