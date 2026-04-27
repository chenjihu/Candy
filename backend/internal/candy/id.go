package candy

import (
	"crypto/rand"
	"strings"
)

const resourceIDAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz"

func newOpaqueID(prefix string) (string, error) {
	const opaqueLength = 20

	buf := make([]byte, opaqueLength)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	var b strings.Builder
	if prefix != "" {
		b.Grow(len(prefix) + 1 + opaqueLength)
		b.WriteString(prefix)
		b.WriteByte('_')
	} else {
		b.Grow(opaqueLength)
	}

	for _, value := range buf {
		b.WriteByte(resourceIDAlphabet[int(value)%len(resourceIDAlphabet)])
	}

	return b.String(), nil
}
