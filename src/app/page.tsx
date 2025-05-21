import Image from 'next/image'
import Link from 'next/link'

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative h-[80vh] flex items-center justify-center">
        <Image
          src="/assets/images/cover-min-1256x1256.jpg"
          alt="blinkywink"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black bg-opacity-50" />
        <div className="relative z-10 text-center text-white">
          <h1 className="text-5xl md:text-7xl font-bold mb-4">BLINKYWINK</h1>
          <p className="text-xl md:text-2xl mb-8">Official Merchandise Store</p>
          <Link href="/products" className="btn-primary">
            Shop Now
          </Link>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16">
        <div className="container">
          <h2 className="text-3xl font-bold mb-8 text-center">Featured Products</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Example Product Card */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <Image
                src="/assets/images/coming-soon.png"
                alt="Product"
                width={400}
                height={400}
                className="w-full h-64 object-cover"
              />
              <div className="p-4">
                <h3 className="text-xl font-semibold mb-2">Product Name</h3>
                <p className="text-gray-600 mb-4">$29.99</p>
                <button className="btn-primary w-full">Add to Cart</button>
              </div>
            </div>
            {/* Add more product cards here */}
          </div>
        </div>
      </section>
    </div>
  )
} 