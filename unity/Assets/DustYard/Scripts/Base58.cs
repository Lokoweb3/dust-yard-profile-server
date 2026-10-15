using System;
using System.Collections.Generic;
using System.Numerics;

namespace DustYard
{
    /// <summary>Bitcoin-alphabet base58, matching the server's bs58.</summary>
    public static class Base58
    {
        const string Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

        public static string Encode(byte[] data)
        {
            var value = new BigInteger(0);
            foreach (var b in data) value = value * 256 + b;
            var chars = new List<char>();
            while (value > 0) { chars.Add(Alphabet[(int)(value % 58)]); value /= 58; }
            foreach (var b in data) { if (b != 0) break; chars.Add('1'); }
            chars.Reverse();
            return new string(chars.ToArray());
        }

        public static byte[] Decode(string s)
        {
            var value = new BigInteger(0);
            foreach (var c in s)
            {
                int i = Alphabet.IndexOf(c);
                if (i < 0) throw new FormatException("not base58");
                value = value * 58 + i;
            }
            var bytes = new List<byte>();
            while (value > 0) { bytes.Add((byte)(value % 256)); value /= 256; }
            foreach (var c in s) { if (c != '1') break; bytes.Add(0); }
            bytes.Reverse();
            return bytes.ToArray();
        }
    }
}
